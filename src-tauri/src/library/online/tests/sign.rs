//! Test keys: minisign signatures made the way `minisign -S` makes them (prehashed: Ed25519
//! over BLAKE2b-512 of the file; the global signature covers signature ‖ trusted comment).

use blake2::{Blake2b512, Digest};
use ring::signature::{Ed25519KeyPair, KeyPair};

pub struct TestKey {
    pair: Ed25519KeyPair,
    keynum: [u8; 8],
}

pub fn b64(bytes: &[u8]) -> String {
    const A: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::new();
    for chunk in bytes.chunks(3) {
        let n = chunk.len();
        let v = (u32::from(chunk[0]) << 16)
            | (u32::from(*chunk.get(1).unwrap_or(&0)) << 8)
            | u32::from(*chunk.get(2).unwrap_or(&0));
        for i in 0..4 {
            if i <= n {
                out.push(A[((v >> (18 - 6 * i)) & 63) as usize] as char);
            } else {
                out.push('=');
            }
        }
    }
    out
}

impl TestKey {
    /// A fixed key per `seed` byte (deterministic tests).
    pub fn new(seed: u8) -> Self {
        let pair = Ed25519KeyPair::from_seed_unchecked(&[seed; 32]).expect("test seed");
        Self {
            pair,
            keynum: [seed, 1, 2, 3, 4, 5, 6, 7],
        }
    }

    /// The `minisign.pub` base64 line.
    pub fn public(&self) -> String {
        let mut bin = b"Ed".to_vec();
        bin.extend_from_slice(&self.keynum);
        bin.extend_from_slice(self.pair.public_key().as_ref());
        b64(&bin)
    }

    pub fn id(&self) -> String {
        format!("{:016X}", u64::from_le_bytes(self.keynum))
    }

    /// A `.minisig` file for `data` with this trusted comment.
    pub fn sign(&self, data: &[u8], trusted: &str) -> String {
        let hash = Blake2b512::digest(data);
        let sig = self.pair.sign(&hash);
        let mut first = b"ED".to_vec();
        first.extend_from_slice(&self.keynum);
        first.extend_from_slice(sig.as_ref());
        let mut global = sig.as_ref().to_vec();
        global.extend_from_slice(trusted.as_bytes());
        let global = self.pair.sign(&global);
        format!(
            "untrusted comment: signature from a test key\n{}\ntrusted comment: {trusted}\n{}\n",
            b64(&first),
            b64(global.as_ref())
        )
    }
}

/// The trusted comment the catalog signs with.
pub fn comment(catalog: &str, sequence: u64) -> String {
    format!("studiovd-catalog catalog={catalog} sequence={sequence} schema=1")
}
