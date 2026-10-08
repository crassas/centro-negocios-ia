use rusqlite::{params_from_iter, Connection, OpenFlags};
use serde_json::{json, Value};
use std::env;
use std::error::Error;
use std::path::Path;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

type AnyError = Box<dyn Error>;

const REGIONS: [&str; 7] = [
    "attention", "memory", "executive", "action", "monitor", "regulation", "reflection",
];

fn observed_at() -> f64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs_f64()
}

fn round3(value: f64) -> f64 {
    if !value.is_finite() {
        return 0.0;
    }
    (value.clamp(0.0, 1.0) * 1000.0).round() / 1000.0
}

fn safe_label(raw: &str, limit: usize) -> String {
    let value: String = raw
        .chars()
        .take(limit)
        .map(|c| if c.is_control() { ' ' } else { c })
        .collect();
    let lower = value.to_ascii_lowercase();
    if ["bearer ", "password=", "token=", "api_key=", "sk-", "ghp_", "gho_", "ghu_"]
        .iter()
        .any(|needle| lower.contains(needle))
    {
        return "[redigido]".to_string();
    }
    value
}

fn open_readonly(path: &Path) -> rusqlite::Result<Connection> {
    // Do not set immutable=true: Python uses WAL and Rust must see committed WAL rows.
    let connection = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
    connection.busy_timeout(Duration::from_millis(700))?;
    Ok(connection)
}

/// The JSON structure matches the existing /brain/graph response.
/// No memory summary, private body or model reasoning trace is exported.
fn graph(connection: &Connection, requested_limit: usize) -> rusqlite::Result<Value> {
    let limit = requested_limit.clamp(1, 120);
    let mut statement = connection.prepare(
        "SELECT id,title,kind,project_id,importance,confidence,updated,source_type \
         FROM travis_neurons WHERE active=1 \
         ORDER BY importance DESC,updated DESC LIMIT ?1",
    )?;
    let mapped = statement.query_map([(limit + 1) as i64], |r| {
        let id: String = r.get(0)?;
        let title: String = r.get(1)?;
        Ok(json!({
            "id": id,
            "title": safe_label(&title, 90),
            "kind": r.get::<_, String>(2)?,
            "projectId": r.get::<_, Option<String>>(3)?.unwrap_or_default(),
            "importance": round3(r.get::<_, Option<f64>>(4)?.unwrap_or(0.0)),
            "confidence": round3(r.get::<_, Option<f64>>(5)?.unwrap_or(0.0)),
            "updated": r.get::<_, Option<f64>>(6)?,
            "sourceType": r.get::<_, Option<String>>(7)?.unwrap_or_default()
        }))
    })?;
    let mut nodes = mapped.collect::<rusqlite::Result<Vec<Value>>>()?;
    let truncated = nodes.len() > limit;
    nodes.truncate(limit);
    let ids: Vec<String> = nodes
        .iter()
        .filter_map(|node| node["id"].as_str().map(ToString::to_string))
        .collect();

    let mut links = Vec::new();
    if !ids.is_empty() {
        // Only placeholders, never user-supplied SQL. Max 120 node IDs.
        let marks = vec!["?"; ids.len()].join(",");
        let sql = format!(
            "SELECT source_id,target_id,relation_type,weight,confidence,updated \
             FROM travis_synapses WHERE active=1 \
             AND source_id IN ({marks}) AND target_id IN ({marks}) \
             ORDER BY updated DESC LIMIT 320"
        );
        let mut statement = connection.prepare(&sql)?;
        let mapped = statement.query_map(
            params_from_iter(ids.iter().chain(ids.iter())),
            |r| {
                Ok(json!({
                    "source": r.get::<_, String>(0)?,
                    "target": r.get::<_, String>(1)?,
                    "relation": r.get::<_, String>(2)?,
                    "weight": round3(r.get::<_, Option<f64>>(3)?.unwrap_or(0.0)),
                    "confidence": round3(r.get::<_, Option<f64>>(4)?.unwrap_or(0.0)),
                    "updated": r.get::<_, Option<f64>>(5)?,
                    "provenance": "persisted-synapse"
                }))
            },
        )?;
        links = mapped.collect::<rusqlite::Result<Vec<Value>>>()?;
    }

    Ok(json!({
        "ok": true,
        "source": "local-sqlite",
        "kind": "persisted-memory-graph",
        "engine": "rust",
        "nodes": nodes,
        "links": links,
        "observedAt": observed_at(),
        "truncated": truncated,
        "disclaimer": "Stored graph, not a biological brain or a model reasoning trace"
    }))
}

/// Actual persisted cognitive transitions. The private detail column is never read.
fn events(connection: &Connection, requested_limit: usize) -> rusqlite::Result<Value> {
    let limit = requested_limit.clamp(1, 240);
    let mut statement = connection.prepare(
        "SELECT id,created,region,phase FROM brain_events \
         WHERE region IN ('attention','memory','executive','action','monitor','regulation','reflection') \
         ORDER BY id DESC LIMIT ?1",
    )?;
    let mapped = statement.query_map([limit as i64], |r| {
        let region: String = r.get(2)?;
        debug_assert!(REGIONS.contains(&region.as_str()));
        Ok(json!({
            "id": r.get::<_, i64>(0)?,
            "created": r.get::<_, Option<f64>>(1)?,
            "region": region,
            "phase": safe_label(&r.get::<_, Option<String>>(3)?.unwrap_or_default(), 60)
        }))
    })?;
    let records = mapped.collect::<rusqlite::Result<Vec<Value>>>()?;
    Ok(json!({
        "ok": true,
        "kind": "observed-cognitive-events",
        "source": "brain-sqlite",
        "engine": "rust",
        "observedAt": observed_at(),
        "events": records,
        "disclaimer": "Observed application events, not a neural activity recording"
    }))
}

/// Operational awareness is based on readable persisted evidence, not memories of
/// acquiring abilities or unverified statements from a language model.
fn status(memory: &Connection, brain: &Connection) -> rusqlite::Result<Value> {
    let neurons: i64 = memory.query_row(
        "SELECT COUNT(*) FROM travis_neurons WHERE active=1", [], |r| r.get(0),
    )?;
    let synapses: i64 = memory.query_row(
        "SELECT COUNT(*) FROM travis_synapses WHERE active=1", [], |r| r.get(0),
    )?;
    let transitions: i64 = brain.query_row(
        "SELECT COUNT(*) FROM brain_events", [], |r| r.get(0),
    )?;
    Ok(json!({
        "ok": true,
        "kind": "operational-awareness",
        "engine": "rust",
        "source": "local-sqlite-readonly",
        "observedAt": observed_at(),
        "features": [
            {"id": "persisted-memory", "state": "verified", "evidence": {"nodes": neurons, "links": synapses}},
            {"id": "observed-events", "state": "verified", "evidence": {"events": transitions}}
        ],
        "limits": [
            "database_readability_is_not_real_world_truth",
            "unprobed_tools_remain_unverified",
            "historical_capability_claims_are_not_evidence",
            "consciousness_not_established"
        ],
        "consciousness": "not_established"
    }))
}

fn flag(args: &[String], name: &str) -> Result<String, AnyError> {
    let position = args.iter().position(|arg| arg == name).ok_or("missing flag")?;
    let value = args.get(position + 1).ok_or("missing flag value")?;
    if value.starts_with("--") { return Err("missing flag value".into()); }
    Ok(value.clone())
}

fn read_limit(args: &[String], default: usize) -> Result<usize, AnyError> {
    if !args.iter().any(|a| a == "--limit") { return Ok(default); }
    let limit: usize = flag(args, "--limit")?.parse()?;
    if limit == 0 { return Err("limit must be positive".into()); }
    Ok(limit)
}

fn run(args: &[String]) -> Result<Value, AnyError> {
    let command = args.get(1).ok_or("missing command")?;
    match command.as_str() {
        "graph" => {
            let db = flag(args, "--db")?;
            let limit = read_limit(args, 120)?;
            Ok(graph(&open_readonly(Path::new(&db))?, limit)?)
        }
        "events" => {
            let db = flag(args, "--db")?;
            let limit = read_limit(args, 80)?;
            Ok(events(&open_readonly(Path::new(&db))?, limit)?)
        }
        "status" => {
            let mem = flag(args, "--memory-db")?;
            let brain = flag(args, "--brain-db")?;
            Ok(status(
                &open_readonly(Path::new(&mem))?,
                &open_readonly(Path::new(&brain))?,
            )?)
        }
        _ => Err("unknown command".into()),
    }
}

fn main() {
    let args: Vec<String> = env::args().collect();
    match run(&args) {
        Ok(value) => println!("{value}"),
        Err(_) => {
            // Paths, database contents and OS errors stay out of public output.
            eprintln!("travis-core: read or argument check failed");
            println!("{}", json!({"ok": false, "error": "read_failed"}));
            std::process::exit(1);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixtures() -> (Connection, Connection) {
        let memory = Connection::open_in_memory().unwrap();
        memory.execute_batch(
            "CREATE TABLE travis_neurons( \
             id TEXT,title TEXT,kind TEXT,project_id TEXT,importance REAL,confidence REAL, \
             updated REAL,source_type TEXT,summary TEXT,active INTEGER); \
             CREATE TABLE travis_synapses( \
             source_id TEXT,target_id TEXT,relation_type TEXT,weight REAL,confidence REAL, \
             updated REAL,active INTEGER); \
             INSERT INTO travis_neurons VALUES \
             ('n1','Pentehouse','FACT','pentehouse',0.9,1.0,100.0,'explicit_user','PRIVATE RECORD',1), \
             ('n2','Porto','CONCEPT','pentehouse',0.8,0.8,90.0,'explicit_user','PRIVATE RECORD',1), \
             ('n3','Inativo','FACT','pentehouse',0.7,1.0,80.0,'explicit_user','PRIVATE RECORD',0); \
             INSERT INTO travis_synapses VALUES \
             ('n1','n2','EXTENDS',0.7,0.9,101.0,1), \
             ('n1','n3','EXTENDS',0.7,0.9,101.0,1);",
        ).unwrap();
        let brain = Connection::open_in_memory().unwrap();
        brain.execute_batch(
            "CREATE TABLE brain_events(id INTEGER PRIMARY KEY,created REAL,region TEXT,phase TEXT,detail TEXT); \
             INSERT INTO brain_events VALUES (1,100.0,'attention','input','SENSITIVE PRIVATE INPUT'); \
             INSERT INTO brain_events VALUES (2,101.0,'monitor','verify','SENSITIVE PRIVATE RESULT'); \
             INSERT INTO brain_events VALUES (3,102.0,'fake_region','wrong','SENSITIVE PRIVATE RESULT');",
        ).unwrap();
        (memory, brain)
    }

    #[test]
    fn graph_only_contains_persisted_active_relations() {
        let (memory, _) = fixtures();
        let value = graph(&memory, 10).unwrap();
        assert_eq!(value["source"], "local-sqlite");
        assert_eq!(value["engine"], "rust");
        assert_eq!(value["nodes"].as_array().unwrap().len(), 2);
        assert_eq!(value["links"].as_array().unwrap().len(), 1);
        assert_eq!(value["links"][0]["provenance"], "persisted-synapse");
        assert!(!value.to_string().contains("PRIVATE RECORD"));
    }

    #[test]
    fn graph_limit_excludes_edges_to_hidden_nodes() {
        let (memory, _) = fixtures();
        let value = graph(&memory, 1).unwrap();
        assert_eq!(value["nodes"].as_array().unwrap().len(), 1);
        assert_eq!(value["links"].as_array().unwrap().len(), 0);
        assert_eq!(value["truncated"], true);
    }

    #[test]
    fn events_are_observed_and_never_expose_detail() {
        let (_, brain) = fixtures();
        let value = events(&brain, 80).unwrap();
        assert_eq!(value["events"].as_array().unwrap().len(), 2);
        assert_eq!(value["events"][0]["region"], "monitor");
        assert!(!value.to_string().contains("SENSITIVE PRIVATE"));
    }

    #[test]
    fn status_does_not_invent_capabilities() {
        let (memory, brain) = fixtures();
        let value = status(&memory, &brain).unwrap();
        assert_eq!(value["features"][0]["evidence"]["nodes"], 2);
        assert_eq!(value["features"][1]["evidence"]["events"], 3);
        assert_eq!(value["consciousness"], "not_established");
        assert_eq!(value["features"].as_array().unwrap().len(), 2);
    }

    #[test]
    fn missing_limit_is_rejected() {
        let args = ["travis-core", "graph", "--db", "/tmp/not-an-existing-db", "--limit", "0"]
            .map(String::from);
        assert!(run(&args).is_err());
    }
}
