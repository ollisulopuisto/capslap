use core::rpc::{RpcRequest, RpcResponse, RpcError, RpcEvent, new_id};
use core::captions;
use std::io::{self, BufRead, Write};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Install panic hook to diagnose silent crashes
    std::panic::set_hook(Box::new(|info| {
        let msg = match info.payload().downcast_ref::<&'static str>() {
            Some(s) => *s,
            None => match info.payload().downcast_ref::<String>() {
                Some(s) => &**s,
                None => "Box<Any>",
            },
        };
        let location = info.location().map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column())).unwrap_or_else(|| "unknown".to_string());
        let log_path = "/tmp/capslap-panic.log";
        let _ = std::fs::write(log_path, format!("Panic occurred at {}: {}", location, msg));
    }));

    let stdin = io::stdin();
    let mut tasks = tokio::task::JoinSet::new();

    for line in stdin.lock().lines() {
        let line = line?;
        if line.trim().is_empty() { continue; }

        let req: Result<RpcRequest, _> = serde_json::from_str(&line);
        match req {
            Ok(r) => {
                // Spawn each request as a concurrent task
                tasks.spawn(async move {
                    handle_request(r).await
                });
            }
            Err(e) => {
                let err = serde_json::json!({ "id": new_id(), "error": format!("Bad request: {}", e) });
                println!("{}", err);
                let _ = io::stdout().flush();
            }
        }
    }

    // Wait for all tasks to complete (though this won't be reached in normal operation)
    while let Some(_) = tasks.join_next().await {}
    Ok(())
}

async fn handle_request(r: RpcRequest) {
    let id = r.id.clone();

    // Emit progress/log events — no captured stdout handle.
    let mut emit = |ev: RpcEvent| {
        println!("{}", serde_json::to_string(&ev).unwrap());
        let _ = io::stdout().flush();
    };

    let write_ok = |value: serde_json::Value| {
        let resp = RpcResponse { id: id.clone(), result: value };
        println!("{}", serde_json::to_string(&resp).unwrap());
        let _ = io::stdout().flush();
    };

    let write_err = |e: String| {
        let err = RpcError { id: id.clone(), error: e };
        println!("{}", serde_json::to_string(&err).unwrap());
        let _ = io::stdout().flush();
    };

    match r.method.as_str() {
        "ping" => write_ok(serde_json::json!({"ok": true})),
        "generateCaptions" => {
            match serde_json::from_value::<core::types::GenerateCaptionsParams>(r.params) {
                Ok(p) => match captions::generate_captions(&id, p, &mut emit).await {
                    Ok(v) => write_ok(serde_json::to_value(v).unwrap()),
                    Err(e) => write_err(e.to_string()),
                },
                Err(e) => write_err(format!("Invalid params for generateCaptions: {}", e)),
            }
        }
        "downloadModel" => {
            match serde_json::from_value::<core::types::DownloadModelParams>(r.params) {
                Ok(p) => match core::whisper::download_model_rpc(&id, p, &mut emit).await {
                    Ok(v) => write_ok(serde_json::to_value(v).unwrap()),
                    Err(e) => write_err(e.to_string()),
                },
                Err(e) => write_err(format!("Invalid params for downloadModel: {}", e)),
            }
        }
        "checkModelExists" => {
            match serde_json::from_value::<String>(r.params) {
                Ok(model_name) => match core::whisper::check_model_exists(&model_name) {
                    Ok(exists) => write_ok(serde_json::to_value(exists).unwrap()),
                    Err(e) => write_err(e.to_string()),
                },
                Err(e) => write_err(format!("Invalid params for checkModelExists: {}", e)),
            }
        }
        _ => write_err(format!("Unknown method: {}", r.method)),
    }
}
