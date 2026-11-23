use serde_json::json;

use windows::{
    core::HSTRING,
    Graphics::Imaging::BitmapDecoder,
    Media::Ocr::OcrEngine,
    Storage::StorageFile,
    Win32::System::WinRT::{RoInitialize, RO_INIT_MULTITHREADED},
};

fn run() -> Result<serde_json::Value, &'static str> {
    let mut args = std::env::args_os().skip(1);
    let path = args.next().ok_or("Image path is required.")?;
    if args.next().is_some() {
        return Err("Invalid helper arguments.");
    }
    let path = path.to_str().ok_or("Image path is invalid.")?;
    unsafe {
        RoInitialize(RO_INIT_MULTITHREADED).map_err(|_| "Windows imaging is unavailable.")?;
    }
    let file = StorageFile::GetFileFromPathAsync(&HSTRING::from(path))
        .map_err(|_| "Image could not be opened.")?
        .join()
        .map_err(|_| "Image could not be opened.")?;
    let stream = file
        .OpenReadAsync()
        .map_err(|_| "Image could not be read.")?
        .join()
        .map_err(|_| "Image could not be read.")?;
    let decoder = BitmapDecoder::CreateAsync(&stream)
        .map_err(|_| "Image could not be decoded.")?
        .join()
        .map_err(|_| "Image could not be decoded.")?;
    let width = decoder
        .PixelWidth()
        .map_err(|_| "Image dimensions unavailable.")?;
    let height = decoder
        .PixelHeight()
        .map_err(|_| "Image dimensions unavailable.")?;
    if width == 0
        || height == 0
        || width > 8192
        || height > 8192
        || u64::from(width) * u64::from(height) > 20_000_000
    {
        return Err("Image dimensions exceed the limit.");
    }
    let codec = decoder
        .DecoderInformation()
        .and_then(|i| i.CodecId())
        .map_err(|_| "Image codec unavailable.")?;
    let mime = if codec == BitmapDecoder::PngDecoderId().map_err(|_| "Image codec unavailable.")? {
        "image/png"
    } else if codec == BitmapDecoder::JpegDecoderId().map_err(|_| "Image codec unavailable.")? {
        "image/jpeg"
    } else if codec == BitmapDecoder::WebpDecoderId().map_err(|_| "Image codec unavailable.")? {
        "image/webp"
    } else {
        return Err("Image codec is unsupported.");
    };
    let bitmap = decoder
        .GetSoftwareBitmapAsync()
        .map_err(|_| "Image could not be decoded.")?
        .join()
        .map_err(|_| "Image could not be decoded.")?;
    let engine = OcrEngine::TryCreateFromUserProfileLanguages()
        .map_err(|_| "No Windows OCR language is available.")?;
    let result = engine
        .RecognizeAsync(&bitmap)
        .map_err(|_| "Image text recognition failed.")?
        .join()
        .map_err(|_| "Image text recognition failed.")?;
    let text = result
        .Text()
        .map_err(|_| "Image text recognition failed.")?
        .to_string();
    if text.len() > 100_000 {
        return Err("OCR text exceeds the limit.");
    }
    Ok(json!({"ok":true,"mime":mime,"width":width,"height":height,"text":text}))
}
fn main() {
    match run() {
        Ok(result) => println!("{result}"),
        Err(message) => {
            println!("{}", json!({"ok":false,"error":message}));
            std::process::exit(1);
        }
    }
}
