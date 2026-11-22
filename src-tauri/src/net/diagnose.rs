//! A precise, plain reason for a failed request (PLAN 4.7: the connection test and every
//! download error say what to change, not "error sending request").

use reqwest::StatusCode;

/// The texts of an error and everything under it, lowercased.
fn chain(e: &(dyn std::error::Error + 'static)) -> String {
    let mut out = e.to_string();
    let mut next = e.source();
    while let Some(s) = next {
        out.push_str(" / ");
        out.push_str(&s.to_string());
        next = s.source();
    }
    out.to_lowercase()
}

/// Why the request to `host` failed, as a sentence.
pub fn explain(host: &str, e: &reqwest::Error) -> String {
    let text = chain(e);
    let has = |words: &[&str]| words.iter().any(|w| text.contains(w));
    if e.is_timeout() {
        format!("{host} did not answer in time (a firewall, or a slow proxy).")
    } else if has(&[
        "certificate",
        "unknownissuer",
        "invalid peer",
        "tls handshake",
    ]) {
        format!(
            "{host}'s certificate is not trusted here. A network that inspects TLS needs its \
             CA added under Settings › Network."
        )
    } else if has(&[
        "dns error",
        "failed to lookup",
        "no such host",
        "name or service",
    ]) {
        format!("{host} could not be found (DNS). Check the connection or the proxy setting.")
    } else if has(&["proxy"]) {
        format!("The proxy refused the connection to {host}. Check Settings › Network.")
    } else if has(&["connection refused", "actively refused"]) {
        format!("{host} refused the connection.")
    } else if e.is_redirect() {
        format!("{host} redirected too often or away from https.")
    } else if e.is_connect() {
        format!("No connection to {host} (offline, or blocked by a firewall).")
    } else if e.is_body() || e.is_decode() {
        format!("The connection to {host} dropped during the download; try again to resume.")
    } else {
        format!("The request to {host} failed ({text}).")
    }
}

/// An HTTP answer that is not a success, as a sentence.
pub fn status(host: &str, code: StatusCode) -> String {
    match code.as_u16() {
        407 => "The proxy asks for a sign-in, which StudioVD cannot give. Download the pack in \
                a browser and use Install from file."
            .to_owned(),
        403 => format!("{host} refused the request (403)."),
        404 => format!("{host} does not have the file (404)."),
        429 => format!("{host} is limiting requests (429); try again later."),
        500..=599 => format!("{host} has a problem ({}); try again later.", code.as_u16()),
        c => format!("{host} answered {c}."),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn statuses_name_the_fix() {
        assert!(
            status("h", StatusCode::PROXY_AUTHENTICATION_REQUIRED).contains("Install from file")
        );
        assert!(status("h", StatusCode::NOT_FOUND).contains("404"));
        assert!(status("h", StatusCode::BAD_GATEWAY).contains("502"));
    }
}
