//! Who vouches for a pack being installed (PLAN 4.4, 4.7): nobody (Install from file of a
//! pack no catalog lists: "Unverified", reserved namespaces refused), or a verified catalog
//! index that lists the pack's SHA-256 and every component's manifest SHA-256.

use super::meta::IndexMeta;
use crate::error::{AppError, AppResult};
use crate::library::installed::Origin;
use crate::library::packfile::PackComponent;

/// Namespaces only signed catalogs may install.
pub const RESERVED: [&str; 4] = ["official", "gen", "builtin", "studiovd"];

pub enum Trust<'a> {
    Unsigned,
    Catalog { meta: &'a IndexMeta, pack: &'a str },
}

fn bad<T>(reason: String) -> AppResult<T> {
    Err(AppError::InvalidInput(reason))
}

impl Trust<'_> {
    pub fn origin(&self) -> Origin {
        match self {
            Self::Unsigned => Origin::Sideloaded,
            Self::Catalog { .. } => Origin::Official,
        }
    }

    pub fn verified(&self) -> bool {
        matches!(self, Self::Catalog { .. })
    }

    /// The archive's own SHA-256 must be the pack the catalog names.
    pub fn check_pack(&self, sha256: &str) -> AppResult<()> {
        match self {
            Self::Catalog { pack, .. } if *pack != sha256 => {
                bad("The pack is not the one the catalog lists (SHA-256).".into())
            }
            _ => Ok(()),
        }
    }

    pub fn check_component(&self, c: &PackComponent) -> AppResult<()> {
        match self {
            Self::Unsigned => {
                let ns = c.id.split('/').next().unwrap_or_default();
                if RESERVED.contains(&ns) {
                    return bad(format!(
                        "{} uses a namespace reserved for signed catalogs",
                        c.id
                    ));
                }
                Ok(())
            }
            Self::Catalog { meta, pack } => match meta.manifest_in(pack, &c.id, &c.version) {
                Some(sha) if sha == c.manifest_sha256 => Ok(()),
                Some(_) => bad(format!(
                    "{} {} is not the manifest the catalog lists",
                    c.id, c.version
                )),
                None => bad(format!(
                    "{} {} is not listed in this pack by the catalog",
                    c.id, c.version
                )),
            },
        }
    }
}
