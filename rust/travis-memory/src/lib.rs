//! Travis memory lexical overlap scorer (pilot, not automatically enabled).
//! One batch FFI call for <=500 memory candidates. No state or network I/O.

use serde::Deserialize;
use std::collections::HashSet;
use std::panic::{catch_unwind, AssertUnwindSafe};
use unicode_normalization::{char::is_combining_mark, UnicodeNormalization};

const MAX_BATCH_BYTES: usize = 2 * 1024 * 1024;
const MAX_ROWS: usize = 500;
const STOPWORDS: &[&str] = &[
    "sobre", "muito", "entao", "quando", "como", "para", "esta", "estou", "este",
    "uma", "uns", "umas", "pelo", "pela", "pelos", "elas", "eles", "com", "sem",
    "sob", "por", "que", "dos", "das", "nos", "nas", "the", "and", "from",
];

#[derive(Deserialize)]
struct Batch {
    // Owning strings is essential: GitHub documentation contains escaped quotes
    // and newlines, which serde cannot always borrow as zero-copy &str.
    query: String,
    rows: Vec<Candidate>,
}
#[derive(Deserialize)]
struct Candidate {
    title: String,
    body: String,
}

fn tokens(text: &str) -> HashSet<String> {
    // Mirrors lower(), NFD decomposition, accent stripping and [a-z0-9]+.
    let lowered = text.to_lowercase();
    let normalized: String = lowered.nfd().filter(|ch| !is_combining_mark(*ch)).collect();
    normalized
        .split(|ch: char| !ch.is_ascii_lowercase() && !ch.is_ascii_digit())
        .filter(|part| !part.is_empty())
        .map(str::to_owned)
        .collect()
}

fn overlaps(batch: &Batch) -> Vec<f64> {
    let mut requested = tokens(&batch.query);
    requested.retain(|word| word.len() >= 3 && !STOPWORDS.contains(&word.as_str()));
    batch.rows.iter().map(|row| {
        let title = tokens(&row.title);
        let body = tokens(&row.body);
        (requested.intersection(&title).count() * 2 + requested.intersection(&body).count()) as f64
    }).collect()
}

/// C ABI: JSON input {"query":"...","rows":[{"title":"...","body":"..."},...]}.
/// Output: one f64 score per row, in the same order.
/// >=0: written row count; -1 invalid pointer; -2 excess size; -3 JSON;
/// -4 insufficient output capacity; -99 caught internal panic.
///
/// # Safety
/// input: readable for input_len bytes. output: writable for out_capacity
/// f64s. Input and output must not overlap.
#[no_mangle]
pub unsafe extern "C" fn travis_memory_overlap_batch(
    input: *const u8, input_len: usize, output: *mut f64, out_capacity: usize
) -> i32 {
    match catch_unwind(AssertUnwindSafe(|| {
        if input.is_null() || input_len == 0 { return Err(-1); }
        if input_len > MAX_BATCH_BYTES || out_capacity > MAX_ROWS { return Err(-2); }
        let input_bytes = unsafe { std::slice::from_raw_parts(input, input_len) };
        let batch: Batch = serde_json::from_slice(input_bytes).map_err(|_| -3)?;
        if batch.rows.len() > MAX_ROWS { return Err(-2); }
        if batch.rows.len() > out_capacity || (!batch.rows.is_empty() && output.is_null()) {
            return Err(-4);
        }
        let scores = overlaps(&batch);
        if !scores.is_empty() {
            unsafe { std::ptr::copy_nonoverlapping(scores.as_ptr(), output, scores.len()) };
        }
        Ok(scores.len() as i32)
    })) {
        Ok(Ok(count)) => count,
        Ok(Err(code)) => code,
        Err(_) => -99,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn one(query: &str, title: &str, body: &str) -> f64 {
        overlaps(&Batch {
            query: query.to_owned(),
            rows: vec![Candidate { title: title.to_owned(), body: body.to_owned() }],
        })[0]
    }
    #[test]
    fn accents_and_title_weight_match_reference() {
        assert_eq!(one("memória Beatriz", "Memória BEATRIZ", "Entrega da Beatriz"), 5.0);
        assert_eq!(one("Pentehouse", "PENTE HOUSE", "Barbearia Pentehouse"), 1.0);
    }
    #[test]
    fn stopwords_excluded_only_in_query() {
        assert_eq!(one("sobre a esta entrega", "Sobre entrega", "Esta entrega"), 3.0);
    }
    #[test]
    fn emojis_are_not_tokens() {
        assert_eq!(one("🎤 🔒", "🎤", "🔒"), 0.0);
    }
    #[test]
    fn batch_preserves_order_and_unique_tokens() {
        let batch = Batch {
            query: "porto porto pizza".into(),
            rows: vec![
                Candidate { title: "pizza".into(), body: "porto".into() },
                Candidate { title: "porto pizza".into(), body: "porto pizza".into() },
                Candidate { title: "lisboa".into(), body: "almada".into() },
            ]
        };
        assert_eq!(overlaps(&batch), vec![3.0, 6.0, 0.0]);
    }
    #[test]
    fn ffi_reads_escaped_newlines_and_quotes_from_github_documents() {
        let data = r#"{"query":"memória Rust","rows":[{"title":"Rust\n documentação","body":"Memória com \"Rust\" no código."}]}"#.as_bytes();
        let mut out = [0.0_f64];
        assert_eq!(unsafe {
            travis_memory_overlap_batch(data.as_ptr(), data.len(), out.as_mut_ptr(), 1)
        }, 1);
        assert_eq!(out, [4.0]);
    }

    #[test]
    fn ffi_rejects_bad_buffers_without_writing() {
        let data = br#"{"query":"portugal","rows":[{"title":"portugal","body":""}]}"#;
        let mut out = [123.0_f64];
        assert_eq!(unsafe { travis_memory_overlap_batch(data.as_ptr(), data.len(), out.as_mut_ptr(), 0) }, -4);
        assert_eq!(out, [123.0]);
        assert_eq!(unsafe { travis_memory_overlap_batch(data.as_ptr(), 6, out.as_mut_ptr(), 1) }, -3);
        assert_eq!(unsafe { travis_memory_overlap_batch(data.as_ptr(), data.len(), out.as_mut_ptr(), 1) }, 1);
        assert_eq!(out, [2.0]);
    }
}
