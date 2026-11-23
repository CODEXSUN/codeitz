param([Parameter(Mandatory=$true)][string]$ImagePath)
$ErrorActionPreference = 'Stop'
try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $null = [Windows.Storage.StorageFile, Windows.Storage, ContentType=WindowsRuntime]
  $null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType=WindowsRuntime]
  $null = [Windows.Media.Ocr.OcrEngine, Windows.Media.Ocr, ContentType=WindowsRuntime]
  $asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } | Select-Object -First 1
  function Await($operation, [type]$type) { $task = $asTask.MakeGenericMethod($type).Invoke($null, @($operation)); $task.GetAwaiter().GetResult() }
  $file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($ImagePath)) ([Windows.Storage.StorageFile])
  $stream = Await ($file.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
  try {
    $decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
    $width = [int64]$decoder.PixelWidth; $height = [int64]$decoder.PixelHeight
    if ($width -lt 1 -or $height -lt 1 -or $width -gt 8192 -or $height -gt 8192 -or ($width * $height) -gt 20000000) { throw 'Image dimensions exceed the limit.' }
    $format = $decoder.DecoderInformation.CodecId.ToString()
    $formats = @{ ([Windows.Graphics.Imaging.BitmapDecoder]::PngDecoderId.ToString()) = 'image/png'; ([Windows.Graphics.Imaging.BitmapDecoder]::JpegDecoderId.ToString()) = 'image/jpeg'; ([Windows.Graphics.Imaging.BitmapDecoder]::WebpDecoderId.ToString()) = 'image/webp' }
    if (-not $formats.ContainsKey($format)) { throw 'Image decoder format is unsupported.' }
    $bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
    try {
      $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
      if ($null -eq $engine) { throw 'No Windows OCR language is available.' }
      $result = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
      $text = $result.Text
      if ($text.Length -gt 100000) { throw 'OCR text exceeds the limit.' }
      @{ ok=$true; width=$width; height=$height; mime=$formats[$format]; text=$text } | ConvertTo-Json -Compress
    } finally { $bitmap.Dispose() }
  } finally { $stream.Dispose() }
} catch {
  @{ ok=$false; error=$_.Exception.Message } | ConvertTo-Json -Compress
  exit 1
}
