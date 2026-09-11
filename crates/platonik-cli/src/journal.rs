//! Shared local immutable objects and no-clobber append-only journal storage.
//! Malicious concurrent directory replacement is outside this local contract.
use platonik_core::check::artifact_hash;
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
#[cfg(unix)]
use std::os::unix::fs::OpenOptionsExt;
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

pub const MAX_ENTRIES: usize = 257;
pub const MAX_OBJECT_BYTES: u64 = 32 * 1024 * 1024;
const MAX_ENTRY_BYTES: u64 = 1024 * 1024;
const MAX_FILES: usize = 1024;
const MAX_STORE_BYTES: u64 = 256 * 1024 * 1024;
pub(crate) static NEXT_TEMP: AtomicU64 = AtomicU64::new(0);
pub const MAX_BUNDLE_BYTES: u64 = 64 * 1024 * 1024;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Entry<T> {
    pub schema: String,
    pub revision: u64,
    pub previous_hash: Option<String>,
    pub event: T,
}

pub struct Store {
    pub(crate) root: PathBuf,
    schema: &'static str,
}

pub(crate) fn uncommitted_import_skeleton(path: &Path) -> Result<(), String> {
    // Before the import marker's no-clobber publication, interruption may leave
    // any subset of the three empty directories and marker-writing temporaries.
    // Admit only this uncommitted shape, preserving every temporary file. A
    // committed journal or object is never adopted without its matching marker.
    for entry in fs::read_dir(path).map_err(problem)? {
        let entry = entry.map_err(problem)?;
        let name = entry.file_name();
        if !matches!(name.to_str(), Some("journal" | "objects" | "tmp")) {
            return Err("Import destination contains unrelated files.".into());
        }
        require_directory(&entry.path())?;
        if name != "tmp"
            && fs::read_dir(entry.path())
                .map_err(problem)?
                .next()
                .is_some()
        {
            return Err("Import cannot overwrite an existing journal or object store.".into());
        }
        // Store::create/inventory subsequently bounds and checks all temporary
        // files before any marker or object write.
    }
    Ok(())
}

pub(crate) fn problem(error: impl std::fmt::Display) -> String {
    error.to_string()
}

pub(crate) fn checked_path(path: &Path) -> Result<PathBuf, String> {
    let absolute = if path.is_absolute() {
        path.to_path_buf()
    } else {
        std::env::current_dir().map_err(problem)?.join(path)
    };
    let mut inspected = PathBuf::new();
    for component in absolute.components() {
        match component {
            Component::ParentDir => return Err("Store paths cannot contain '..'.".into()),
            Component::CurDir => continue,
            _ => inspected.push(component.as_os_str()),
        }
        match fs::symlink_metadata(&inspected) {
            Ok(metadata) if metadata.file_type().is_symlink() => {
                return Err("Store paths cannot traverse symlinks.".into());
            }
            Ok(_) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(problem(error)),
        }
    }
    Ok(absolute)
}

pub(crate) fn require_directory(path: &Path) -> Result<(), String> {
    let metadata = fs::symlink_metadata(path).map_err(problem)?;
    if !metadata.is_dir() || metadata.file_type().is_symlink() {
        return Err("A store directory is not a real directory.".into());
    }
    Ok(())
}

pub(crate) fn sync_directory(path: &Path) -> Result<(), String> {
    #[cfg(unix)]
    {
        File::open(path)
            .and_then(|directory| directory.sync_all())
            .map_err(problem)?;
    }
    #[cfg(not(unix))]
    {
        let _ = path;
    }
    Ok(())
}

pub(crate) fn regular_bytes(path: &Path, limit: u64) -> Result<Vec<u8>, String> {
    let before = fs::symlink_metadata(path).map_err(problem)?;
    if !before.is_file() || before.file_type().is_symlink() {
        return Err("Store objects and entries must be regular files, not links or pipes.".into());
    }
    if before.len() > limit {
        return Err("Stored file exceeds its size limit.".into());
    }
    let mut options = OpenOptions::new();
    options.read(true);
    #[cfg(unix)]
    options.custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK);
    let file = options.open(path).map_err(problem)?;
    let opened = file.metadata().map_err(problem)?;
    if !opened.is_file() || opened.len() > limit {
        return Err("Opened store file is not a bounded regular file.".into());
    }
    let mut bytes = Vec::new();
    file.take(limit + 1)
        .read_to_end(&mut bytes)
        .map_err(problem)?;
    if bytes.len() as u64 > limit {
        return Err("Stored file grew beyond its size limit.".into());
    }
    Ok(bytes)
}

fn hash_component(hash: &str) -> Result<&str, String> {
    let value = hash
        .strip_prefix("sha256:")
        .ok_or("Object identity must use sha256.")?;
    if value.len() != 64
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        return Err("Invalid object identity.".into());
    }
    Ok(value)
}

impl Store {
    pub fn create(path: &Path, schema: &'static str) -> Result<Self, String> {
        let root = checked_path(path)?;
        match fs::create_dir(&root) {
            Ok(()) => {
                if let Some(parent) = root.parent() {
                    sync_directory(parent)?;
                }
            }
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
                require_directory(&root)?
            }
            Err(error) => return Err(problem(error)),
        }
        let store = Self { root, schema };
        // Inspect before adding directories to an already existing path. Init
        // must not turn an unrelated user directory into an expedition store.
        for entry in fs::read_dir(&store.root).map_err(problem)? {
            let entry = entry.map_err(problem)?;
            if entry.file_name() == "import.json" {
                regular_bytes(&entry.path(), 1024)?;
                continue;
            }
            if !matches!(
                entry.file_name().to_str(),
                Some("journal" | "objects" | "tmp")
            ) {
                return Err("Initialization destination contains unrelated files.".into());
            }
            require_directory(&entry.path())?;
        }
        // Creation is recoverable after interruption between these directory writes.
        for child in ["journal", "objects", "tmp"] {
            let path = store.root.join(child);
            match fs::create_dir(&path) {
                Ok(()) => {}
                Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
                    require_directory(&path)?
                }
                Err(error) => return Err(problem(error)),
            }
        }
        sync_directory(&store.root)?;
        store.inventory()?;
        Ok(store)
    }

    pub fn open(path: &Path, schema: &'static str) -> Result<Self, String> {
        let store = Self {
            root: checked_path(path)?,
            schema,
        };
        require_directory(&store.root)?;
        for child in ["journal", "objects", "tmp"] {
            require_directory(&store.root.join(child))?;
        }
        store.inventory()?;
        Ok(store)
    }

    fn inventory(&self) -> Result<(usize, u64), String> {
        for entry in fs::read_dir(&self.root).map_err(problem)? {
            let entry = entry.map_err(problem)?;
            if entry.file_name() == "import.json" {
                regular_bytes(&entry.path(), 1024)?;
                continue;
            }
            if !matches!(
                entry.file_name().to_str(),
                Some("journal" | "objects" | "tmp")
            ) {
                return Err("Unrecognized file in the expedition directory.".into());
            }
            require_directory(&entry.path())?;
        }
        let mut count = 0usize;
        let mut bytes = 0u64;
        for child in ["journal", "objects", "tmp"] {
            for entry in fs::read_dir(self.root.join(child)).map_err(problem)? {
                let entry = entry.map_err(problem)?;
                let metadata = fs::symlink_metadata(entry.path()).map_err(problem)?;
                if !metadata.is_file() || metadata.file_type().is_symlink() {
                    return Err("Store contains a symlink, pipe, or nonregular object.".into());
                }
                count += 1;
                bytes = bytes
                    .checked_add(metadata.len())
                    .ok_or("Store size overflow.")?;
                if count > MAX_FILES || bytes > MAX_STORE_BYTES {
                    return Err("Expedition store growth limit reached; preserve this store and start a new expedition.".into());
                }
            }
        }
        Ok((count, bytes))
    }

    pub fn load<T: DeserializeOwned + Serialize>(&self) -> Result<Vec<Entry<T>>, String> {
        self.inventory()?;
        let mut names = Vec::new();
        for entry in fs::read_dir(self.root.join("journal")).map_err(problem)? {
            let entry = entry.map_err(problem)?;
            let name = entry
                .file_name()
                .into_string()
                .map_err(|_| "Invalid journal filename.")?;
            if name.len() != 25
                || !name.ends_with(".json")
                || !name[..20].bytes().all(|byte| byte.is_ascii_digit())
            {
                return Err("Invalid committed journal filename.".into());
            }
            names.push(name);
            if names.len() > MAX_ENTRIES {
                return Err("Journal entry limit exceeded.".into());
            }
        }
        names.sort();
        let mut entries = Vec::with_capacity(names.len());
        let mut previous = None;
        for (index, name) in names.iter().enumerate() {
            if name != &format!("{index:020}.json") {
                return Err("Journal has a gap or a nonzero starting revision.".into());
            }
            let bytes = regular_bytes(&self.root.join("journal").join(name), MAX_ENTRY_BYTES)?;
            let entry: Entry<T> = serde_json::from_slice(&bytes).map_err(problem)?;
            if entry.schema != self.schema
                || entry.revision != index as u64
                || entry.previous_hash != previous
            {
                return Err(
                    "Journal schema, revision, or previous-entry identity is corrupt.".into(),
                );
            }
            let canonical = serde_json::to_vec(&entry).map_err(problem)?;
            if bytes != canonical {
                return Err(
                    "Committed journal bytes are not canonical; the entry may have been altered."
                        .into(),
                );
            }
            previous = Some(artifact_hash(&entry)?);
            entries.push(entry);
        }
        Ok(entries)
    }

    pub fn object<T: DeserializeOwned + Serialize>(&self, hash: &str) -> Result<T, String> {
        let path = self
            .root
            .join("objects")
            .join(format!("{}.json", hash_component(hash)?));
        let bytes = regular_bytes(&path, MAX_OBJECT_BYTES)?;
        let object: T = serde_json::from_slice(&bytes).map_err(problem)?;
        if artifact_hash(&object)? != hash {
            return Err("Stored object's content does not match its identity.".into());
        }
        if serde_json::to_vec(&object).map_err(problem)? != bytes {
            return Err("Stored object is not canonical JSON.".into());
        }
        Ok(object)
    }

    pub fn put<T: Serialize>(&self, object: &T) -> Result<String, String> {
        let hash = artifact_hash(object)?;
        let bytes = serde_json::to_vec(object).map_err(problem)?;
        if bytes.len() as u64 > MAX_OBJECT_BYTES {
            return Err("Object exceeds the 32 MiB limit.".into());
        }
        let path = self
            .root
            .join("objects")
            .join(format!("{}.json", hash_component(&hash)?));
        self.publish(&path, &bytes, true)?;
        Ok(hash)
    }

    pub fn append<T: DeserializeOwned + Serialize>(
        &self,
        event: T,
        expected_revision: Option<u64>,
    ) -> Result<Entry<T>, String> {
        let history = self.load::<T>()?;
        let actual = history.last().map(|entry| entry.revision);
        if actual != expected_revision {
            return Err(format!(
                "Stale revision: expected {expected_revision:?}, current {actual:?}."
            ));
        }
        if history.len() >= MAX_ENTRIES {
            return Err("Expedition journal is full.".into());
        }
        let entry = Entry {
            schema: self.schema.into(),
            revision: history.len() as u64,
            previous_hash: history.last().map(artifact_hash).transpose()?,
            event,
        };
        let bytes = serde_json::to_vec(&entry).map_err(problem)?;
        if bytes.len() as u64 > MAX_ENTRY_BYTES {
            return Err("Journal event exceeds 1 MiB.".into());
        }
        let path = self
            .root
            .join("journal")
            .join(format!("{:020}.json", entry.revision));
        self.publish(&path, &bytes, false)?;
        Ok(entry)
    }

    pub(crate) fn publish(
        &self,
        destination: &Path,
        bytes: &[u8],
        idempotent_object: bool,
    ) -> Result<(), String> {
        if fs::symlink_metadata(destination).is_ok() {
            if idempotent_object && regular_bytes(destination, MAX_OBJECT_BYTES)? == bytes {
                return Ok(());
            }
            return Err("Revision conflict: immutable destination already exists.".into());
        }
        let (files, used) = self.inventory()?;
        // Reserve room for both the temporary link and committed name, including
        // the conservative double counting of their shared inode during publication.
        if files + 2 > MAX_FILES || used + 2 * bytes.len() as u64 > MAX_STORE_BYTES {
            return Err("Expedition store growth limit reached.".into());
        }
        let mut options = OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        options.mode(0o600);
        let (temporary, mut file) = (0..MAX_FILES)
            .find_map(|_| {
                let temporary = self.root.join("tmp").join(format!(
                    "{}-{}.part",
                    std::process::id(),
                    NEXT_TEMP.fetch_add(1, Ordering::Relaxed)
                ));
                match options.open(&temporary) {
                    Ok(file) => Some(Ok((temporary, file))),
                    Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => None,
                    Err(error) => Some(Err(problem(error))),
                }
            })
            .ok_or("Cannot reserve a unique temporary object filename.")??;
        file.write_all(bytes)
            .and_then(|_| file.sync_all())
            .map_err(problem)?;
        drop(file);
        #[cfg(test)]
        publication_crash_hook(destination, "synced-temp");
        let published = match fs::hard_link(&temporary, destination) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
                if idempotent_object && regular_bytes(destination, MAX_OBJECT_BYTES)? == bytes {
                    Ok(())
                } else {
                    Err("Revision conflict: another writer committed first.".into())
                }
            }
            Err(error) => Err(problem(error)),
        };
        if published.is_ok() {
            #[cfg(test)]
            publication_crash_hook(destination, "linked-entry");
            sync_directory(destination.parent().unwrap())?;
        }
        fs::remove_file(&temporary).map_err(problem)?;
        sync_directory(&self.root.join("tmp"))?;
        published
    }
}

// Compiled only into this binary's unit-test harness, never into the CLI used by
// players. A separate process exits without cleanup at a precise write boundary.
#[cfg(test)]
fn publication_crash_hook(destination: &Path, stage: &str) {
    if destination
        .file_name()
        .is_some_and(|name| name == "00000000000000000001.json")
        && std::env::var("PLATONIK_TEST_CRASH_STAGE").as_deref() == Ok(stage)
    {
        std::process::exit(86);
    }
}
