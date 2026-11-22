//! The proxy plan (PLAN 4.7): the Windows registry forms, bypass lists, manual proxies.

use super::proxy_plan::{glob, ProxyPlan};
use reqwest::Url;

fn url(s: &str) -> Url {
    Url::parse(s).expect("test URL")
}

#[test]
fn reads_the_per_protocol_form_hyper_util_misreads() {
    let plan = ProxyPlan::from_windows("http=proxy:8080;https=secure:8443;ftp=f:21", "");
    assert_eq!(plan.http.as_deref(), Some("http://proxy:8080"));
    assert_eq!(plan.https.as_deref(), Some("http://secure:8443"));
    assert_eq!(
        plan.proxy_for(&url("https://github.com/x")),
        Some("http://secure:8443")
    );
}

#[test]
fn one_value_serves_both_and_socks_fills_in() {
    let plan = ProxyPlan::from_windows("corp:3128", "");
    assert_eq!(plan.https.as_deref(), Some("http://corp:3128"));
    let socks = ProxyPlan::from_windows("socks=s:1080", "");
    assert_eq!(socks.https.as_deref(), Some("socks5://s:1080"));
    let mixed = ProxyPlan::from_windows("https=h:1;socks=s:2", "");
    assert_eq!(mixed.https.as_deref(), Some("http://h:1"));
    assert_eq!(mixed.http.as_deref(), Some("socks5://s:2"));
}

#[test]
fn bypass_list_with_wildcards_and_local() {
    let plan = ProxyPlan::from_windows("p:1", "*.corp.example;10.*;<local>; ;");
    assert!(plan.bypass_local);
    assert_eq!(plan.proxy_for(&url("https://git.corp.example/")), None);
    assert_eq!(plan.proxy_for(&url("https://10.1.2.3/")), None);
    assert_eq!(plan.proxy_for(&url("https://intranet/")), None);
    assert_eq!(
        plan.proxy_for(&url("https://github.com/")),
        Some("http://p:1")
    );
    assert_eq!(
        plan.proxy_for(&url("https://110.1.2.3/")),
        Some("http://p:1")
    );
}

#[test]
fn manual_proxy_and_bad_values() {
    let plan = ProxyPlan::manual("http://proxy.local:8080", "localhost, *.lan").expect("valid");
    assert_eq!(plan.proxy_for(&url("http://localhost/")), None);
    assert_eq!(plan.proxy_for(&url("https://nas.lan/")), None);
    assert!(ProxyPlan::manual("ftp://x", "").is_none());
    assert!(ProxyPlan::manual("", "").is_none());
    assert!(ProxyPlan::from_windows("", "").http.is_none());
}

#[test]
fn glob_matches_like_windows() {
    assert!(glob("*", "anything"));
    assert!(glob("a*c", "abbbc"));
    assert!(!glob("a*c", "abbb"));
    assert!(glob("*.example.com", "x.example.com"));
    assert!(!glob("*.example.com", "example.com"));
}
