//! Convex decomposition (PLAN 10.2). Rapier's JS build has none, and a concave part's hull
//! fills its holes: a shaft could never sit in its bore. V-HACD (parry3d) splits the mesh
//! into convex pieces; test mode gives each piece its own hull collider. The webview sends
//! the mesh it already holds and gets the pieces back; they are cached per asset in the
//! workspace (`colliders/`), derived data that is never saved into the `.stvd`.
//!
//! Wire formats, little-endian. Mesh in: `u32 vertices, u32 triangles, f32 × 3 per vertex,
//! u32 × 3 per triangle`. Pieces out: `u32 pieces`, then per piece `u32 points, f32 × 3 each`.

use crate::error::{AppError, AppResult};
use crate::fsutil::write_atomic;
use crate::workspace::sha256_hex;
use parry3d::math::Vector;
use parry3d::transformation::vhacd::{VHACDParameters, VHACD};
use std::fs;
use std::path::Path;

/// Largest mesh decomposed (the import pipeline's own limits are lower).
pub const MAX_VERTICES: usize = 4_000_000;
pub const MAX_TRIANGLES: usize = 8_000_000;
/// Most pieces per part: each is a collider test mode has to carry.
pub const MAX_PIECES: u32 = 32;
/// Voxels along the longest side. 64 resolves a 20 mm part to about 0.3 mm.
const RESOLUTION: u32 = 64;
/// Bump when the parameters change: cached pieces are named by it.
const CACHE_VERSION: u32 = 1;

pub struct Mesh {
    pub points: Vec<Vector>,
    pub triangles: Vec<[u32; 3]>,
}

fn bad<T>(reason: &str) -> AppResult<T> {
    Err(AppError::InvalidInput(format!(
        "The mesh cannot be decomposed: {reason}."
    )))
}

fn u32_at(bytes: &[u8], at: usize) -> Option<u32> {
    let slice = bytes.get(at..at + 4)?;
    Some(u32::from_le_bytes([slice[0], slice[1], slice[2], slice[3]]))
}

/// Reads and checks a mesh: exact length, finite coordinates, indices in range, and a real
/// volume to split (V-HACD has no answer for a flat or empty mesh).
pub fn parse_mesh(bytes: &[u8]) -> AppResult<Mesh> {
    let (Some(vertices), Some(triangles)) = (u32_at(bytes, 0), u32_at(bytes, 4)) else {
        return bad("it is empty");
    };
    let (vertices, triangles) = (vertices as usize, triangles as usize);
    if vertices < 4 || triangles < 4 || vertices > MAX_VERTICES || triangles > MAX_TRIANGLES {
        return bad("it has too few or too many triangles");
    }
    if bytes.len() != 8 + 12 * vertices + 12 * triangles {
        return bad("its size does not match its counts");
    }
    let float = |at: usize| u32_at(bytes, at).map(f32::from_bits).unwrap_or(f32::NAN);
    let mut points = Vec::with_capacity(vertices);
    let (mut min, mut max) = ([f32::INFINITY; 3], [f32::NEG_INFINITY; 3]);
    for v in 0..vertices {
        let at = 8 + 12 * v;
        let p = [float(at), float(at + 4), float(at + 8)];
        if p.iter().any(|c| !c.is_finite() || c.abs() > 1e8) {
            return bad("a coordinate is not a number, or out of range");
        }
        for k in 0..3 {
            min[k] = min[k].min(p[k]);
            max[k] = max[k].max(p[k]);
        }
        points.push(Vector::new(p[0], p[1], p[2]));
    }
    if (0..3).any(|k| max[k] - min[k] <= f32::EPSILON) {
        return bad("it is flat");
    }
    let base = 8 + 12 * vertices;
    let mut out = Vec::with_capacity(triangles);
    for t in 0..triangles {
        let at = base + 12 * t;
        let tri = [
            u32_at(bytes, at).unwrap_or(u32::MAX),
            u32_at(bytes, at + 4).unwrap_or(u32::MAX),
            u32_at(bytes, at + 8).unwrap_or(u32::MAX),
        ];
        if tri.iter().any(|i| *i as usize >= vertices) {
            return bad("a triangle names a vertex it does not have");
        }
        // A triangle with a repeated corner has no area: V-HACD needs none of them.
        if tri[0] != tri[1] && tri[1] != tri[2] && tri[0] != tri[2] {
            out.push(tri);
        }
    }
    if out.len() < 4 {
        return bad("it has no triangles with an area");
    }
    Ok(Mesh {
        points,
        triangles: out,
    })
}

/// The mesh as convex pieces: each the exact hull of the mesh's own surface inside one
/// V-HACD part, so a piece never reaches further into a hole than the surface's chords.
pub fn decompose(mesh: &Mesh) -> Vec<Vec<[f32; 3]>> {
    let params = VHACDParameters {
        resolution: RESOLUTION,
        max_convex_hulls: MAX_PIECES,
        ..VHACDParameters::default()
    };
    let parts = VHACD::decompose(&params, &mesh.points, &mesh.triangles, true);
    parts
        .compute_exact_convex_hulls(&mesh.points, &mesh.triangles)
        .into_iter()
        .map(|(points, _)| points.iter().map(|p| [p.x, p.y, p.z]).collect::<Vec<_>>())
        .filter(|points: &Vec<[f32; 3]>| points.len() >= 4)
        .collect()
}

pub fn encode(pieces: &[Vec<[f32; 3]>]) -> Vec<u8> {
    let mut out = (pieces.len() as u32).to_le_bytes().to_vec();
    for piece in pieces {
        out.extend((piece.len() as u32).to_le_bytes());
        for p in piece {
            for c in p {
                out.extend(c.to_le_bytes());
            }
        }
    }
    out
}

/// Whether `bytes` is a pieces file as `encode` writes it (a cache file is checked before
/// it is trusted: the workspace is a folder anyone can write to).
pub fn is_pieces(bytes: &[u8]) -> bool {
    let Some(count) = u32_at(bytes, 0) else {
        return false;
    };
    if count == 0 || count > 4 * MAX_PIECES {
        return false;
    }
    let mut at = 4usize;
    for _ in 0..count {
        let Some(points) = u32_at(bytes, at) else {
            return false;
        };
        let end = at + 4 + 12 * points as usize;
        if points < 4 || end > bytes.len() {
            return false;
        }
        let finite = (at + 4..end)
            .step_by(4)
            .all(|i| u32_at(bytes, i).is_some_and(|b| f32::from_bits(b).is_finite()));
        if !finite {
            return false;
        }
        at = end;
    }
    at == bytes.len()
}

/// `mesh` (wire format) as encoded pieces, cached in `cache` under the SHA-256 of the mesh
/// itself: an entry can only ever answer for the exact bytes that made it. A cache entry
/// that does not read back as pieces is computed again. Without a cache, always computed.
pub fn decompose_cached(mesh: &[u8], cache: Option<&Path>) -> AppResult<Vec<u8>> {
    let entry = cache.map(|dir| dir.join(format!("{}.v{CACHE_VERSION}.bin", sha256_hex(mesh))));
    if let Some(bytes) = entry.as_ref().and_then(|path| fs::read(path).ok()) {
        if is_pieces(&bytes) {
            return Ok(bytes);
        }
    }
    let pieces = decompose(&parse_mesh(mesh)?);
    if pieces.is_empty() {
        return bad("no convex piece came out of it");
    }
    let bytes = encode(&pieces);
    if let (Some(dir), Some(path)) = (cache, entry) {
        // A cache that cannot be written only costs the next run the same work.
        let _ = fs::create_dir_all(dir).and_then(|_| {
            write_atomic(&path, &bytes).map_err(|e| std::io::Error::other(format!("{e:?}")))
        });
    }
    Ok(bytes)
}

#[cfg(test)]
mod tests;
