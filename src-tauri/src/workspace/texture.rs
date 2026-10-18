//! Texture images (PLAN 6.3): PNG or JPEG only, checked from their headers before anything
//! decodes them. A few kilobytes of compressed data can claim gigapixels, so the pixel size
//! is capped as well as the file size, both when an image is chosen and when a `.stvd` is
//! opened.

use super::sha256_hex;
use crate::error::{AppError, AppResult};
use crate::fsutil::write_atomic;
use std::path::Path;

/// Largest texture file, in a project or chosen by the user.
pub const MAX_TEXTURE_BYTES: u64 = 16 * 1024 * 1024;
/// Largest side in pixels (the WebGL2 minimum guarantee is 2048; desktop GPUs do 8192+).
pub const MAX_TEXTURE_SIDE: u32 = 8192;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ImageKind {
    Png,
    Jpeg,
}

impl ImageKind {
    /// The extension a texture of this kind is stored under.
    pub fn ext(self) -> &'static str {
        match self {
            ImageKind::Png => "png",
            ImageKind::Jpeg => "jpg",
        }
    }
}

const PNG_SIGNATURE: &[u8] = b"\x89PNG\r\n\x1a\n";

fn be16(bytes: &[u8], at: usize) -> Option<u32> {
    let b = bytes.get(at..at + 2)?;
    Some(u32::from(b[0]) << 8 | u32::from(b[1]))
}

fn be32(bytes: &[u8], at: usize) -> Option<u32> {
    let b = bytes.get(at..at + 4)?;
    Some(u32::from_be_bytes([b[0], b[1], b[2], b[3]]))
}

/// JPEG frame size from the first start-of-frame marker before the scan data.
fn jpeg_size(bytes: &[u8]) -> Option<(u32, u32)> {
    let mut at = 2; // after SOI (FF D8)
    loop {
        if *bytes.get(at)? != 0xFF {
            return None;
        }
        while *bytes.get(at + 1)? == 0xFF {
            at += 1; // fill bytes
        }
        let marker = *bytes.get(at + 1)?;
        match marker {
            0x01 | 0xD0..=0xD7 => at += 2, // no length
            0xD8..=0xDA => return None,    // SOI again, EOI or scan before any frame
            0xC0..=0xCF if !matches!(marker, 0xC4 | 0xC8 | 0xCC) => {
                return Some((be16(bytes, at + 7)?, be16(bytes, at + 5)?));
            }
            _ => at += 2 + usize::try_from(be16(bytes, at + 2)?).ok()?,
        }
    }
}

/// Kind and pixel size (width, height), read from the header alone.
pub fn image_header(bytes: &[u8]) -> Option<(ImageKind, u32, u32)> {
    if bytes.starts_with(PNG_SIGNATURE) && bytes.get(12..16) == Some(b"IHDR") {
        return Some((ImageKind::Png, be32(bytes, 16)?, be32(bytes, 20)?));
    }
    if bytes.starts_with(&[0xFF, 0xD8]) {
        let (w, h) = jpeg_size(bytes)?;
        return Some((ImageKind::Jpeg, w, h));
    }
    None
}

/// Format, file size and pixel size of a texture, before it is stored or served.
pub fn check_texture(bytes: &[u8]) -> AppResult<(ImageKind, u32, u32)> {
    if bytes.len() as u64 > MAX_TEXTURE_BYTES {
        return Err(AppError::InvalidInput(format!(
            "The image is too large (the limit is {} MB).",
            MAX_TEXTURE_BYTES / 1_000_000
        )));
    }
    let (kind, w, h) = image_header(bytes)
        .ok_or_else(|| AppError::InvalidInput("Only PNG and JPEG images can be used.".into()))?;
    if w == 0 || h == 0 || w > MAX_TEXTURE_SIDE || h > MAX_TEXTURE_SIDE {
        return Err(AppError::InvalidInput(format!(
            "The image is {w}×{h} pixels; at most {MAX_TEXTURE_SIDE}×{MAX_TEXTURE_SIDE} is supported."
        )));
    }
    Ok((kind, w, h))
}

/// A texture stored in a workspace.
pub struct StoredTexture {
    pub id: String,
    pub kind: ImageKind,
    pub width: u32,
    pub height: u32,
}

/// Checks `bytes` and stores them in `textures_dir` as `<sha256>.<ext>`.
pub fn write_texture(textures_dir: &Path, bytes: &[u8]) -> AppResult<StoredTexture> {
    let (kind, width, height) = check_texture(bytes)?;
    let id = sha256_hex(bytes);
    let path = textures_dir.join(format!("{id}.{}", kind.ext()));
    if !path.is_file() {
        std::fs::create_dir_all(textures_dir)?;
        write_atomic(&path, bytes)?;
    }
    Ok(StoredTexture {
        id,
        kind,
        width,
        height,
    })
}

#[cfg(test)]
pub(crate) mod tests;
