//! Typed application error returned by every command (CLAUDE.md §3: no `unwrap` in command
//! paths). Serializes as `{ "kind": "...", "message": "..." }`. Every kind emitted here must be
//! listed in `APP_ERROR_KINDS` in `src/lib/tauri/result.ts` (the TS side has extra kinds of its
//! own, such as `unavailable` and `internal`). Add variants when a phase first needs them.

use serde::ser::{Serialize, SerializeStruct, Serializer};
use std::fmt;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AppError {
    /// The feature exists in the UI but its backend lands in a later phase.
    NotImplemented { feature: &'static str, phase: u8 },
    /// The caller sent arguments the command cannot accept.
    InvalidInput(String),
    /// File-system or OS failure.
    Io(String),
}

impl AppError {
    pub fn not_implemented(feature: &'static str, phase: u8) -> Self {
        Self::NotImplemented { feature, phase }
    }

    pub fn kind(&self) -> &'static str {
        match self {
            Self::NotImplemented { .. } => "notImplemented",
            Self::InvalidInput(_) => "invalidInput",
            Self::Io(_) => "io",
        }
    }
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::NotImplemented { feature, phase } => {
                write!(f, "{feature} arrives in Phase {phase}.")
            }
            Self::InvalidInput(msg) | Self::Io(msg) => f.write_str(msg),
        }
    }
}

impl std::error::Error for AppError {}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        Self::Io(e.to_string())
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
        let json = serde_json::to_value(AppError::not_implemented("Saving projects", 5))
            .expect("AppError always serializes");
        assert_eq!(
            json,
            serde_json::json!({ "kind": "notImplemented", "message": "Saving projects arrives in Phase 5." })
        );
    }

    #[test]
    fn io_errors_map_to_io_kind() {
        let e: AppError = std::io::Error::new(std::io::ErrorKind::NotFound, "missing").into();
        assert_eq!(e.kind(), "io");
        assert_eq!(e.to_string(), "missing");
    }
}
