#[cfg(windows)]
pub fn pick_repository() -> Result<Option<String>, String> {
    use windows::{
        core::w,
        Win32::{
            System::Com::{
                CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize,
                CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED,
            },
            UI::Shell::{
                FileOpenDialog, IFileOpenDialog, FOS_FORCEFILESYSTEM, FOS_PICKFOLDERS,
                SIGDN_FILESYSPATH,
            },
        },
    };

    struct ComApartment;
    impl Drop for ComApartment {
        fn drop(&mut self) {
            unsafe {
                CoUninitialize();
            }
        }
    }

    // This is a folder-only user selection. Git identity, canonical path and ownership
    // are checked by the broker before an app can be registered or approved for work.
    unsafe {
        CoInitializeEx(None, COINIT_APARTMENTTHREADED)
            .ok()
            .map_err(|_| "The Windows folder picker could not initialize.".to_string())?;
        let _apartment = ComApartment;
        let dialog: IFileOpenDialog = CoCreateInstance(&FileOpenDialog, None, CLSCTX_INPROC_SERVER)
            .map_err(|_| "The Windows folder picker could not open.".to_string())?;
        dialog
            .SetOptions(FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM)
            .map_err(|_| "Folder selection could not be configured.".to_string())?;
        dialog
            .SetTitle(w!("Choose this app's Git repository"))
            .map_err(|_| "Folder selection could not be configured.".to_string())?;
        if let Err(error) = dialog.Show(None) {
            if error.code().0 as u32 == 0x800704C7 {
                return Ok(None);
            }
            return Err("The Windows folder picker failed.".into());
        }
        let item = dialog
            .GetResult()
            .map_err(|_| "The selected folder could not be read.".to_string())?;
        let allocated_path = item
            .GetDisplayName(SIGDN_FILESYSPATH)
            .map_err(|_| "Select a local filesystem folder.".to_string())?;
        let selected = allocated_path
            .to_string()
            .map_err(|_| "The selected folder name is invalid.".to_string());
        CoTaskMemFree(Some(allocated_path.0.cast()));
        selected.map(Some)
    }
}

#[cfg(not(windows))]
pub fn pick_repository() -> Result<Option<String>, String> {
    Err("This local preview's repository picker supports Windows only.".into())
}
