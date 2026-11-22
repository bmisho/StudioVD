//! A tiny HTTP/1.1 server for download tests: one thread per connection, `Connection: close`,
//! replies that can stop early (a dropped connection) or stall (to cancel mid-stream).

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::net::TcpListener;
use std::sync::{Arc, Mutex};
use std::time::Duration;

#[derive(Clone, Debug)]
pub struct Request {
    pub path: String,
    pub headers: HashMap<String, String>,
}

#[derive(Default)]
pub struct Reply {
    pub status: u16,
    pub headers: Vec<(String, String)>,
    pub body: Vec<u8>,
    /// Content-Length (default: the body's length).
    pub length: Option<usize>,
    /// Send this many body bytes, then close.
    pub cut_after: Option<usize>,
    /// Send this many body bytes, then wait.
    pub stall_after: Option<usize>,
}

impl Reply {
    pub fn ok(body: &[u8]) -> Self {
        Self {
            status: 200,
            body: body.to_vec(),
            ..Self::default()
        }
    }

    pub fn status(status: u16) -> Self {
        Self {
            status,
            ..Self::default()
        }
    }

    pub fn header(mut self, name: &str, value: &str) -> Self {
        self.headers.push((name.into(), value.into()));
        self
    }
}

pub struct Mock {
    pub base: String,
    pub hits: Arc<Mutex<Vec<Request>>>,
}

impl Mock {
    pub fn hits(&self) -> Vec<Request> {
        self.hits.lock().map(|h| h.clone()).unwrap_or_default()
    }
}

type Handler = dyn Fn(&Request, usize) -> Reply + Send + Sync;

/// Serves `handler(request, how many earlier requests had this path)` on 127.0.0.1.
pub fn serve(handler: impl Fn(&Request, usize) -> Reply + Send + Sync + 'static) -> Mock {
    let listener = TcpListener::bind("127.0.0.1:0").expect("bind");
    let base = format!("http://{}/", listener.local_addr().expect("addr"));
    let hits: Arc<Mutex<Vec<Request>>> = Arc::default();
    let handler: Arc<Handler> = Arc::new(handler);
    let shared = hits.clone();
    std::thread::spawn(move || {
        for stream in listener.incoming().flatten() {
            let (handler, hits) = (handler.clone(), shared.clone());
            std::thread::spawn(move || {
                let mut reader = BufReader::new(stream.try_clone().expect("clone"));
                let mut line = String::new();
                if reader.read_line(&mut line).is_err() {
                    return;
                }
                let path = line.split_whitespace().nth(1).unwrap_or("/").to_owned();
                let mut headers = HashMap::new();
                loop {
                    let mut h = String::new();
                    if reader.read_line(&mut h).is_err() || h.trim().is_empty() {
                        break;
                    }
                    if let Some((k, v)) = h.split_once(':') {
                        headers.insert(k.trim().to_ascii_lowercase(), v.trim().to_owned());
                    }
                }
                let req = Request { path, headers };
                let nth = {
                    let mut all = hits.lock().expect("hits");
                    let n = all.iter().filter(|r| r.path == req.path).count();
                    all.push(req.clone());
                    n
                };
                let reply = handler(&req, nth);
                let mut out = stream;
                let length = reply.length.unwrap_or(reply.body.len());
                let mut head = format!(
                    "HTTP/1.1 {} X\r\nContent-Length: {length}\r\nConnection: close\r\n",
                    reply.status
                );
                for (k, v) in &reply.headers {
                    head.push_str(&format!("{k}: {v}\r\n"));
                }
                head.push_str("\r\n");
                let _ = out.write_all(head.as_bytes());
                let send = reply
                    .cut_after
                    .or(reply.stall_after)
                    .unwrap_or(reply.body.len());
                let _ = out.write_all(&reply.body[..send.min(reply.body.len())]);
                let _ = out.flush();
                if reply.stall_after.is_some() {
                    std::thread::sleep(Duration::from_secs(10));
                }
            });
        }
    });
    Mock { base, hits }
}
