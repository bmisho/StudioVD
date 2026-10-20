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

/// A scan: its header, entropy-coded bytes (a stuffed FF 00, a restart marker).
const SCAN: &[u8] = &[
    0xFF, 0xDA, 0x00, 0x0C, 3, 1, 0x00, 2, 0x11, 3, 0x11, 0, 0x3F, 0, // SOS
    0x12, 0xFF, 0x00, 0x34, 0xFF, 0xD0, 0x56,
];
const EOI: &[u8] = &[0xFF, 0xD9];

/// SOI, an APP0 segment, `before` (more segments), then a baseline SOF0 frame header.
fn jpeg_header(width: u16, height: u16, before: &[u8]) -> Vec<u8> {
    let mut bytes = vec![0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10];
    bytes.extend_from_slice(b"JFIF\0\x01\x01\0\0\x01\0\x01\0\0");
    bytes.extend_from_slice(before);
    bytes.extend_from_slice(&[0xFF, 0xFF, 0xC0, 0x00, 0x11, 0x08]); // a fill byte, SOF0
    bytes.extend_from_slice(&height.to_be_bytes());
    bytes.extend_from_slice(&width.to_be_bytes());
    bytes.extend_from_slice(&[3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
    bytes
}

/// A whole (structurally valid) baseline JPEG: header, one scan, EOI.
pub fn jpeg(width: u16, height: u16) -> Vec<u8> {
    [jpeg_header(width, height, &[]), SCAN.to_vec(), EOI.to_vec()].concat()
}

/// FF 00 is no marker: libjpeg skips it with the bytes after it and reads the 20000 x 20000
/// frame there, while a walk taking it for a segment lands on the 16 x 16 frame hidden in the
/// comment after it (review finding: decoded 1.6 GB from a 4.5 MB file).
pub fn hidden_frame_jpeg() -> Vec<u8> {
    let mut bytes = vec![0xFF, 0xD8, 0xFF, 0x00, 0x00, 0x13];
    bytes.extend_from_slice(&[
        0xFF, 0xC0, 0, 0x0B, 8, 0x4E, 0x20, 0x4E, 0x20, 1, 1, 0x11, 0,
    ]);
    bytes.extend_from_slice(&[0xFF, 0xFE, 0x00, 0x0F]); // COM
    bytes.extend_from_slice(&[0xFF, 0xC0, 0, 0x0B, 8, 0, 0x10, 0, 0x10, 1, 1, 0x11, 0]);
    [bytes, SCAN.to_vec(), EOI.to_vec()].concat()
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
fn reads_only_the_frame_a_decoder_reads() {
    assert!(
        check_texture(&hidden_frame_jpeg()).is_err(),
        "FF 00 taken for a segment"
    );
    let header = |before: &[u8]| jpeg_header(64, 64, before);
    let whole = |head: Vec<u8>, rest: &[&[u8]]| {
        [vec![head], rest.iter().map(|r| r.to_vec()).collect()]
            .concat()
            .concat()
    };
    let comment: &[u8] = &[0xFF, 0xFE, 0x00, 0x04, b'h', b'i'];
    assert!(check_texture(&whole(header(comment), &[SCAN, EOI])).is_ok());
    for (why, bad) in [
        (
            "a byte that is no marker",
            whole(header(&[0x00]), &[SCAN, EOI]),
        ),
        (
            "a reserved marker",
            whole(header(&[0xFF, 0xF0, 0x00, 0x02]), &[SCAN, EOI]),
        ),
        (
            "a length below 2",
            whole(header(&[0xFF, 0xFE, 0x00, 0x01]), &[SCAN, EOI]),
        ),
        (
            "a second frame",
            whole(header(&[]), &[&jpeg_header(16, 16, &[])[20..], SCAN, EOI]),
        ),
        ("no scan", whole(header(&[]), &[EOI])),
        ("ends in a segment", header(&[])),
    ] {
        assert!(check_texture(&bad).is_err(), "{why}");
    }
    // Data cut short in a scan is what a browser still decodes (and bounded by the frame).
    assert!(check_texture(&whole(header(&[]), &[SCAN])).is_ok());
}

#[test]
fn refuses_progressive_jpegs_with_more_scans_than_encoders_write() {
    let scans = |n: usize| {
        let mut bytes = jpeg_header(64, 64, &[]);
        (0..n).for_each(|_| bytes.extend_from_slice(SCAN));
        [bytes, EOI.to_vec()].concat()
    };
    assert!(check_texture(&scans(MAX_JPEG_SCANS)).is_ok());
    assert!(check_texture(&scans(MAX_JPEG_SCANS + 1)).is_err());
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
