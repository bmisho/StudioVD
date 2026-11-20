use super::*;

/// A ring about +Y: outer and inner radius, height, `n` segments (closed, outward-facing).
fn ring(outer: f32, inner: f32, height: f32, n: u32) -> Vec<u8> {
    let mut points: Vec<[f32; 3]> = Vec::new();
    for i in 0..n {
        let a = i as f32 / n as f32 * std::f32::consts::TAU;
        let (s, c) = a.sin_cos();
        for (r, y) in [(outer, 0.0), (outer, height), (inner, height), (inner, 0.0)] {
            points.push([r * c, y, r * s]);
        }
    }
    let mut triangles: Vec<[u32; 3]> = Vec::new();
    for i in 0..n {
        let (a, b) = (4 * i, 4 * ((i + 1) % n));
        // Four quads per segment: outer wall, top, inner wall, bottom.
        for k in 0..4 {
            let (p, q) = (a + k, a + (k + 1) % 4);
            let (r, s) = (b + k, b + (k + 1) % 4);
            triangles.push([p, q, s]);
            triangles.push([p, s, r]);
        }
    }
    let mut out = (points.len() as u32).to_le_bytes().to_vec();
    out.extend((triangles.len() as u32).to_le_bytes());
    for p in &points {
        for c in p {
            out.extend(c.to_le_bytes());
        }
    }
    for t in &triangles {
        for i in t {
            out.extend(i.to_le_bytes());
        }
    }
    out
}

/// How close to the Y axis the segment a–b comes (in the XZ plane).
fn axis_distance(a: [f32; 3], b: [f32; 3]) -> f32 {
    let (ax, az, bx, bz) = (a[0], a[2], b[0], b[2]);
    let (dx, dz) = (bx - ax, bz - az);
    let len2 = dx * dx + dz * dz;
    let t = if len2 > 0.0 {
        (-(ax * dx + az * dz) / len2).clamp(0.0, 1.0)
    } else {
        0.0
    };
    ((ax + t * dx).powi(2) + (az + t * dz).powi(2)).sqrt()
}

#[test]
fn a_ring_splits_into_pieces_that_leave_its_bore_open() {
    let (outer, inner) = (11.0, 4.0);
    let mesh = parse_mesh(&ring(outer, inner, 7.0, 48)).expect("mesh");
    let pieces = decompose(&mesh);
    assert!(
        pieces.len() >= 4 && pieces.len() <= MAX_PIECES as usize,
        "{} pieces",
        pieces.len()
    );
    let mut closest = f32::INFINITY;
    for piece in &pieces {
        for (i, a) in piece.iter().enumerate() {
            // Inside the ring's own bounds (the mesh's surface, never beyond it).
            let r = (a[0] * a[0] + a[2] * a[2]).sqrt();
            assert!(
                r <= outer + 1e-3 && a[1] >= -1e-3 && a[1] <= 7.0 + 1e-3,
                "{a:?}"
            );
            for b in &piece[i + 1..] {
                closest = closest.min(axis_distance(*a, *b));
            }
        }
    }
    // A single hull would cover the axis (distance 0). The pieces' chords cut into the
    // 4 mm bore by less than a millimetre: a 6 mm shaft turns in it untouched.
    assert!(
        closest > 3.0,
        "the pieces come within {closest} mm of the axis"
    );
    let bytes = encode(&pieces);
    assert!(is_pieces(&bytes));
    assert!(!is_pieces(&bytes[..bytes.len() - 1]));
    assert!(!is_pieces(&[0, 0, 0, 0]));
}

#[test]
fn refuses_meshes_it_cannot_split() {
    let good = ring(11.0, 4.0, 7.0, 12);
    let reason = |bytes: &[u8]| match parse_mesh(bytes) {
        Ok(_) => String::new(),
        Err(e) => format!("{e:?}"),
    };
    assert!(reason(&[]).contains("empty"));
    assert!(reason(&good[..good.len() - 4]).contains("size"));
    let mut index = good.clone();
    let last = index.len() - 4;
    index[last..].copy_from_slice(&u32::MAX.to_le_bytes());
    assert!(reason(&index).contains("vertex"));
    let mut nan = good.clone();
    nan[8..12].copy_from_slice(&f32::NAN.to_le_bytes());
    assert!(reason(&nan).contains("not a number"));
    let mut flat = good.clone();
    let vertices = u32::from_le_bytes([good[0], good[1], good[2], good[3]]) as usize;
    for v in 0..vertices {
        let y = 8 + 12 * v + 4;
        flat[y..y + 4].copy_from_slice(&0f32.to_le_bytes());
    }
    assert!(reason(&flat).contains("flat"));
    let mut counts = good;
    counts[0..4].copy_from_slice(&u32::MAX.to_le_bytes());
    assert!(reason(&counts).contains("too few or too many"));
}

#[test]
fn caches_by_the_mesh_itself_and_recomputes_a_damaged_entry() {
    let dir = crate::bundle::tests::raw::temp("colliders");
    let mesh = ring(11.0, 4.0, 7.0, 24);
    let first = decompose_cached(&mesh, Some(&dir)).expect("pieces");
    let entries: Vec<_> = fs::read_dir(&dir).expect("cache").flatten().collect();
    assert_eq!(entries.len(), 1);
    let path = entries[0].path();
    assert!(path
        .file_name()
        .is_some_and(|n| n.to_string_lossy().starts_with(&sha256_hex(&mesh))));
    // Read back, not computed: a marked entry is returned as it is.
    let mut marked = first.clone();
    let last = marked.len() - 4;
    marked[last..].copy_from_slice(&1.5f32.to_le_bytes());
    fs::write(&path, &marked).expect("mark");
    assert_eq!(decompose_cached(&mesh, Some(&dir)).expect("cached"), marked);
    // A damaged entry is not trusted.
    fs::write(&path, b"junk").expect("damage");
    assert_eq!(decompose_cached(&mesh, Some(&dir)).expect("again"), first);
    // Another mesh never reads this one's entry.
    let other = ring(12.0, 4.0, 7.0, 24);
    assert_ne!(decompose_cached(&other, Some(&dir)).expect("other"), first);
    assert_eq!(decompose_cached(&mesh, None).expect("uncached"), first);
}
