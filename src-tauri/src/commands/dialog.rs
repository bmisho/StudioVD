//! Save-dialog helpers shared by Export and Save As.

use crate::error::{AppError, AppResult};
use crate::picked::file_name;
use std::path::PathBuf;

/// A file-name stem for the dialog: no separators or control characters, at most 120 chars.
pub fn clean_stem(name: &str) -> String {
    let stem: String = name
        .chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            c if c.is_control() => '_',
            c => c,
        })
        .take(120)
        .collect();
    let stem = stem.trim().trim_matches('.').to_owned();
    if stem.is_empty() {
        "assembly".into()
    } else {
        stem
    }
}

/// The file a save dialog chose, with `ext`. The extension is added when missing, but then
/// the dialog's overwrite prompt saw another name (GTK asks about `bracket`, we would write
/// `bracket.stl`), so an existing file under the final name is refused, not replaced.
pub fn with_extension(mut chosen: PathBuf, ext: &str) -> AppResult<PathBuf> {
    if chosen
        .extension()
        .is_some_and(|e| e.eq_ignore_ascii_case(ext))
    {
        return Ok(chosen);
    }
    chosen.as_mut_os_string().push(format!(".{ext}"));
    if chosen.exists() {
        return Err(AppError::InvalidInput(format!(
            "{} already exists. Choose it in the dialog to replace it.",
            file_name(&chosen)
        )));
    }
    Ok(chosen)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn stems() {
        assert_eq!(clean_stem("../a/b:c"), "_a_b_c");
        assert_eq!(clean_stem("  ...  "), "assembly");
    }

    #[test]
    fn an_added_extension_never_replaces_an_existing_file() {
        let dir = std::env::temp_dir().join(format!("studiovd-export-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("dir");
        fs::write(dir.join("bracket.stl"), b"original").expect("original");
        // Typed with the extension: the dialog already asked about this exact file.
        assert!(with_extension(dir.join("bracket.STL"), "stl").is_ok());
        // Typed without it: the dialog asked about `bracket`, which does not exist.
        let err = with_extension(dir.join("bracket"), "stl").unwrap_err();
        assert_eq!(err.kind(), "invalidInput");
        let fresh = with_extension(dir.join("new"), "stl").expect("new name");
        assert_eq!(fresh, dir.join("new.stl"));
        let _ = fs::remove_dir_all(dir);
    }
}
