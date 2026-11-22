//! Typed application error returned by every command (CLAUDE.md §3: no `unwrap` in command
//! paths). Serializes as `{ "kind": "...", "message": "..." }`. Every kind emitted here must be
//! listed in `APP_ERROR_KINDS` in `src/lib/tauri/result.ts` (the TS side has extra kinds of its
//! own, such as `unavailable` and `internal`). Add variants when a phase first needs them.

use serde::ser::{Serialize, SerializeStruct, Serializer};
use std::fmt;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AppError {
    /// The caller sent arguments the command cannot accept.
    InvalidInput(String),
    /// File-system or OS failure.
    Io(String),
    /// A download failed: no connection, a refused certificate, a server error (Phase 14).
    Network(String),
    /// The user cancelled it (a download).
    Cancelled(String),
}

impl AppError {
    /// Leads the message with what failed ("robot.stvd could not be opened."), same kind.
    pub fn context(self, what: &str) -> Self {
        match self {
            Self::InvalidInput(m) => Self::InvalidInput(format!("{what} {m}")),
            Self::Io(m) => Self::Io(format!("{what} {m}")),
            Self::Network(m) => Self::Network(format!("{what} {m}")),
            Self::Cancelled(m) => Self::Cancelled(format!("{what} {m}")),
        }
    }

    pub fn kind(&self) -> &'static str {
        match self {
            Self::InvalidInput(_) => "invalidInput",
            Self::Io(_) => "io",
            Self::Network(_) => "network",
            Self::Cancelled(_) => "cancelled",
        }
    }
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidInput(msg) | Self::Io(msg) | Self::Network(msg) | Self::Cancelled(msg) => {
                f.write_str(msg)
            }
        }
    }
}

impl std::error::Error for AppError {}

impl From<std::io::Error> for AppError {
    /// Keeps the OS text, led by a plain reason for the failures users can act on.
    fn from(e: std::io::Error) -> Self {
        use std::io::ErrorKind as K;
        let reason = match e.kind() {
            K::StorageFull | K::QuotaExceeded => Some("The disk is full"),
            K::PermissionDenied | K::ReadOnlyFilesystem => Some("No permission to write there"),
            // ERROR_SHARING_VIOLATION / ERROR_LOCK_VIOLATION have no ErrorKind.
            _ if cfg!(windows) && matches!(e.raw_os_error(), Some(32 | 33)) => {
                Some("Another program has the file open")
            }
            _ => None,
        };
        Self::Io(match reason {
            Some(reason) => format!("{reason} ({e})."),
            None => e.to_string(),
        })
    }
}

impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut s = serializer.serialize_struct("AppError", 2)?;
        s.serialize_field("kind", self.kind())?;
        s.serialize_field("message", &self.to_string())?;
        s.end()
    }
}

pub type AppResult<T> = Result<T, AppError>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_kind_and_message() {
        let json = serde_json::to_value(AppError::InvalidInput("Bad token.".into()))
            .expect("AppError always serializes");
        assert_eq!(
            json,
            serde_json::json!({ "kind": "invalidInput", "message": "Bad token." })
        );
    }

    #[test]
    fn io_errors_lead_with_a_plain_reason() {
        let full = AppError::from(std::io::Error::from(std::io::ErrorKind::StorageFull));
        assert!(full.to_string().starts_with("The disk is full ("));
    }

    #[test]
    fn io_errors_map_to_io_kind() {
        let e: AppError = std::io::Error::new(std::io::ErrorKind::NotFound, "missing").into();
        assert_eq!(e.kind(), "io");
        assert_eq!(e.to_string(), "missing");
    }
}
