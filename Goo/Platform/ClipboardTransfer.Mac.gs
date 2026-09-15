package Goo

import System
import System.Collections.Generic
import System.IO
import System.Runtime.InteropServices

internal unsafe partial class ClipboardTransfer {
  shared {
    private const ImageIO string = "/System/Library/Frameworks/ImageIO.framework/ImageIO"

    @DllImport("/usr/lib/libobjc.A.dylib") private func objc_getClass(name string) nint;
    @DllImport("/usr/lib/libobjc.A.dylib") private func sel_registerName(name string) nint;
    @DllImport("/usr/lib/libobjc.A.dylib") private func objc_autoreleasePoolPush() nint;
    @DllImport("/usr/lib/libobjc.A.dylib") private func objc_autoreleasePoolPop(pool nint);
    @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint: "objc_msgSend") private func MacSend(receiver nint, selector nint) nint;
    @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint: "objc_msgSend") private func MacSendArg(receiver nint, selector nint, argument nint) nint;
    @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint: "objc_msgSend") private func MacCount(receiver nint, selector nint) nuint;
    @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint: "objc_msgSend") private func MacAt(receiver nint, selector nint, index nuint) nint;
    @DllImport("/usr/lib/libobjc.A.dylib", EntryPoint: "objc_msgSend") private func MacContains(receiver nint, selector nint, argument nint) uint8;
    @DllImport("/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation") private func CFRelease(value nint);
    @DllImport("/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation") private func CFDataCreate(allocator nint, bytes * uint8, length nint) nint;
    @DllImport("/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation") private func CFDataCreateMutable(allocator nint, capacity nint) nint;
    @DllImport("/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation") private func CFDataGetLength(data nint) nint;
    @DllImport("/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation") private func CFDataGetBytePtr(data nint) nint;
    @DllImport("/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation") private func CFDictionaryGetValue(dictionary nint, key nint) nint;
    @DllImport("/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation") private func CFNumberGetValue(number nint, formatType nint, ref value int64) uint8;
    @DllImport("/System/Library/Frameworks/ImageIO.framework/ImageIO") private func CGImageSourceCreateWithData(data nint, options nint) nint;
    @DllImport("/System/Library/Frameworks/ImageIO.framework/ImageIO") private func CGImageSourceCopyPropertiesAtIndex(source nint, index nuint, options nint) nint;
    @DllImport("/System/Library/Frameworks/ImageIO.framework/ImageIO") private func CGImageSourceCreateImageAtIndex(source nint, index nuint, options nint) nint;
    @DllImport("/System/Library/Frameworks/ImageIO.framework/ImageIO") private func CGImageDestinationCreateWithData(data nint, formatType nint, count nuint, options nint) nint;
    @DllImport("/System/Library/Frameworks/ImageIO.framework/ImageIO") private func CGImageDestinationAddImage(destination nint, image nint, properties nint);
    @DllImport("/System/Library/Frameworks/ImageIO.framework/ImageIO") private func CGImageDestinationFinalize(destination nint) uint8;

    private func MacString(value string) nint {
      let bytes = Marshal.StringToCoTaskMemUTF8(value)
      try { return MacSendArg(objc_getClass("NSString"), sel_registerName("stringWithUTF8String:"), bytes) }
      finally { Marshal.FreeCoTaskMem(bytes) }
    }

    private func MacPasteboard() nint -> MacSend(objc_getClass("NSPasteboard"), sel_registerName("generalPasteboard"))

    private func MacHasFiles() bool {
      let pool = objc_autoreleasePoolPush()
      try {
        let types = MacSend(MacPasteboard(), sel_registerName("types"))
        return MacContains(types, sel_registerName("containsObject:"), MacString("public.file-url")) != 0
      } finally { objc_autoreleasePoolPop(pool) }
    }

    private func MacReadFiles() ClipboardFiles {
      let pool = objc_autoreleasePoolPush()
      try {
        let items = MacSend(MacPasteboard(), sel_registerName("pasteboardItems"))
        let count = MacCount(items, sel_registerName("count"))
        if count > nuint(NativeFilePaths.MaxCount) { throw ClipboardLimitException("Clipboard exceeds 4096 pasteboard items") }
        let paths = List[string](int32(count))
        let formatType = MacString("public.file-url")
        var units = 0
        for i in 0 ... int32(count) {
          let item = MacAt(items, sel_registerName("objectAtIndex:"), nuint(i))
          let value = MacSendArg(item, sel_registerName("stringForType:"), formatType)
          if value == nint(0) { continue }
          if MacCount(value, sel_registerName("length")) > nuint(131072) { throw ClipboardLimitException("Clipboard file URL exceeds its text budget") }
          let uri = BoundedUtf8(MacSend(value, sel_registerName("UTF8String")), 524288)
          let parsed = ParseFiles(uri, false)
          for path in parsed.Paths { NativeFilePaths.Add(paths, path, ref units) }
        }
        return ClipboardFiles(if paths.Count == 0 { ClipboardReadStatus.Empty } else { ClipboardReadStatus.Success }, paths.ToArray())
      } finally { objc_autoreleasePoolPop(pool) }
    }

    private func MacImageToPng(bytes []uint8) []uint8 {
      let pool = objc_autoreleasePoolPush()
      var data nint
      var source nint
      var properties nint
      var image nint
      var output nint
      var destination nint
      var library nint
      try {
        fixed pointer * uint8 = bytes{ data = CFDataCreate(nint(0), pointer, nint(bytes.Length)) }
        if data == nint(0) { throw IOException("Cannot copy native clipboard image") }
        source = CGImageSourceCreateWithData(data, nint(0))
        if source == nint(0) { throw InvalidDataException("Unsupported native clipboard image") }
        properties = CGImageSourceCopyPropertiesAtIndex(source, nuint(0), nint(0))
        if properties == nint(0) { throw InvalidDataException("Native image has no dimensions") }
        library = NativeLibrary.Load(ImageIO)
        let widthKey = Marshal.ReadIntPtr(NativeLibrary.GetExport(library, "kCGImagePropertyPixelWidth"))
        let heightKey = Marshal.ReadIntPtr(NativeLibrary.GetExport(library, "kCGImagePropertyPixelHeight"))
        let widthNumber = CFDictionaryGetValue(properties, widthKey)
        let heightNumber = CFDictionaryGetValue(properties, heightKey)
        var width = 0L
        var height = 0L
        if widthNumber == nint(0) || heightNumber == nint(0)
          || CFNumberGetValue(widthNumber, nint(4), ref width) == 0 || CFNumberGetValue(heightNumber, nint(4), ref height) == 0 {
            throw InvalidDataException("Native image has invalid dimensions")
          }
        if width > int32.MaxValue || height > int32.MaxValue || width <= 0 || height <= 0 { throw ClipboardLimitException("Native image dimensions exceed the budget") }
        ClipboardBitmap.ValidateDimensions(int32(width), int32(height))
        image = CGImageSourceCreateImageAtIndex(source, nuint(0), nint(0))
        if image == nint(0) { throw InvalidDataException("Native image decode failed") }
        output = CFDataCreateMutable(nint(0), nint(0))
        if output == nint(0) { throw IOException("Cannot allocate PNG output") }
        destination = CGImageDestinationCreateWithData(output, MacString("public.png"), nuint(1), nint(0))
        if destination == nint(0) { throw IOException("PNG conversion is unavailable") }
        CGImageDestinationAddImage(destination, image, nint(0))
        if CGImageDestinationFinalize(destination) == 0 { throw InvalidDataException("PNG conversion failed") }
        let length = CFDataGetLength(output)
        if length < nint(0) || length > nint(MaxImageBytes) { throw ClipboardLimitException("Normalized PNG exceeds 64 MiB") }
        let result = [int32(length)]uint8
        Marshal.Copy(CFDataGetBytePtr(output), result, 0, result.Length)
        return result
      } finally {
        if destination != nint(0) { CFRelease(destination) }
        if output != nint(0) { CFRelease(output) }
        if image != nint(0) { CFRelease(image) }
        if properties != nint(0) { CFRelease(properties) }
        if source != nint(0) { CFRelease(source) }
        if data != nint(0) { CFRelease(data) }
        if library != nint(0) { NativeLibrary.Free(library) }
        objc_autoreleasePoolPop(pool)
      }
    }
  }
}
