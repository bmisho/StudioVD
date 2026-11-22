//! When to try a busy server again (429/503, PLAN 14.3): its `Retry-After` (seconds or an
//! HTTP date), else 1, 2, 4 s; never longer than a minute, at most three retries.

use super::meta::days_from_civil;
use std::time::Duration;

pub const MAX_RETRIES: u32 = 3;
pub const MAX_WAIT: Duration = Duration::from_secs(60);

/// The wait a `Retry-After` value asks for at `now` (seconds since 1970).
pub fn retry_after(value: &str, now: u64) -> Option<Duration> {
    let v = value.trim();
    if let Ok(secs) = v.parse::<u64>() {
        return Some(Duration::from_secs(secs).min(MAX_WAIT));
    }
    let at = http_date(v)?;
    Some(Duration::from_secs(at.saturating_sub(now)).min(MAX_WAIT))
}

/// The wait before retry `attempt` (0-based) when the server named none.
pub fn backoff(attempt: u32) -> Duration {
    Duration::from_secs(1u64 << attempt.min(5)).min(MAX_WAIT)
}

const MONTHS: [&str; 12] = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/// IMF-fixdate (`Sun, 06 Nov 1994 08:49:37 GMT`), the form HTTP servers send.
fn http_date(s: &str) -> Option<u64> {
    let words: Vec<&str> = s.split_whitespace().collect();
    let [_weekday, day, month, year, time, "GMT"] = words.as_slice() else {
        return None;
    };
    let day: u64 = day.parse().ok()?;
    let month = MONTHS.iter().position(|m| m == month)? as u64 + 1;
    let year: u64 = year.parse().ok()?;
    let mut hms = time.split(':').map(|p| p.parse::<u64>().ok());
    let (h, m, sec) = (hms.next()??, hms.next()??, hms.next()??);
    if hms.next().is_some() || !(1..=31).contains(&day) || h > 23 || m > 59 || sec > 60 {
        return None;
    }
    Some(days_from_civil(year, month, day)? * 86_400 + h * 3600 + m * 60 + sec)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn seconds_and_dates() {
        assert_eq!(retry_after("7", 0), Some(Duration::from_secs(7)));
        assert_eq!(retry_after("100000", 0), Some(MAX_WAIT));
        // 784111777 is Sun, 06 Nov 1994 08:49:37 GMT.
        let at = 784_111_777;
        assert_eq!(
            retry_after("Sun, 06 Nov 1994 08:49:37 GMT", at - 5),
            Some(Duration::from_secs(5))
        );
        assert_eq!(
            retry_after("Sun, 06 Nov 1994 08:49:37 GMT", at + 5),
            Some(Duration::ZERO)
        );
        assert_eq!(retry_after("soon", 0), None);
        assert_eq!(retry_after("Sun, 06 Foo 1994 08:49:37 GMT", 0), None);
    }

    #[test]
    fn backoff_doubles_up_to_the_cap() {
        assert_eq!(backoff(0), Duration::from_secs(1));
        assert_eq!(backoff(2), Duration::from_secs(4));
        assert_eq!(backoff(30), Duration::from_secs(32));
    }
}
