use super::*;

pub fn png(width: u32, height: u32) -> Vec<u8> {
    let mut bytes = PNG_SIGNATURE.to_vec();
    bytes.extend_from_slice(&13u32.to_be_bytes());
    bytes.extend_from_slice(b"IHDR");
    bytes.extend_from_slice(&width.to_be_bytes());
    bytes.extend_from_slice(&height.to_be_bytes());
    bytes.extend_from_slice(&[8, 6, 0, 0, 0, 0, 0, 0, 0]); // depth, colour type, ..., CRC
    bytes
}

/// SOI, an APP0 segment, then a baseline SOF0 frame header.
pub fn jpeg(width: u16, height: u16) -> Vec<u8> {
    let mut bytes = vec![0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10];
    bytes.extend_from_slice(b"JFIF\0\x01\x01\0\0\x01\0\x01\0\0");
    bytes.extend_from_slice(&[0xFF, 0xFF, 0xC0, 0x00, 0x11, 0x08]); // a fill byte, SOF0
    bytes.extend_from_slice(&height.to_be_bytes());
    bytes.extend_from_slice(&width.to_be_bytes());
    bytes.extend_from_slice(&[3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
    bytes
}

#[test]
fn reads_png_and_jpeg_sizes_from_their_headers() {
    assert_eq!(
        image_header(&png(640, 480)),
        Some((ImageKind::Png, 640, 480))
    );
    assert_eq!(
        image_header(&jpeg(1024, 768)),
        Some((ImageKind::Jpeg, 1024, 768))
    );
    assert_eq!(image_header(b"GIF89a\x01\x00\x01\x00"), None);
    assert_eq!(image_header(&png(1, 1)[..20]), None, "truncated");
    let mut scan_first = vec![0xFF, 0xD8, 0xFF, 0xDA, 0x00, 0x02];
    scan_first.extend_from_slice(&jpeg(8, 8)[2..]);
    assert_eq!(image_header(&scan_first), None, "no frame before the scan");
}

#[test]
fn refuses_decompression_bombs_and_other_formats() {
    assert!(check_texture(&png(MAX_TEXTURE_SIDE, MAX_TEXTURE_SIDE)).is_ok());
    for bad in [
        png(MAX_TEXTURE_SIDE + 1, 16),
        png(65_535, 65_535), // a few bytes claiming 4 gigapixels
        png(0, 16),
        jpeg(16, 9000),
        b"BM not a png".to_vec(),
    ] {
        assert!(check_texture(&bad).is_err());
    }
    let mut big = png(16, 16);
    big.resize(MAX_TEXTURE_BYTES as usize + 1, 0);
    assert!(check_texture(&big).is_err());
}

#[test]
fn stores_textures_under_their_hash_with_the_real_extension() {
    let dir = std::env::temp_dir().join(format!("studiovd-tex-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    let bytes = jpeg(32, 16);
    let stored = write_texture(&dir.join("textures"), &bytes).expect("stored");
    assert_eq!(
        (stored.kind, stored.width, stored.height),
        (ImageKind::Jpeg, 32, 16)
    );
    assert_eq!(stored.id, sha256_hex(&bytes));
    let path = dir.join("textures").join(format!("{}.jpg", stored.id));
    assert_eq!(std::fs::read(&path).expect("file"), bytes);
    assert!(
        write_texture(&dir.join("textures"), &bytes).is_ok(),
        "again: same file"
    );
    let _ = std::fs::remove_dir_all(dir);
}
