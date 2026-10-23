package Goo

import System
import System.Collections.Generic
import System.Runtime.InteropServices
import Hexa.NET.SDL3

internal class SdlApplicationActivation {
    shared {
        private var documents List[Uri]?
        private var rejected bool
        private var textBytes int32

        internal func Receive(kind SDLEventType, data nint) {
            documents ??= List[Uri](ApplicationActivation.MaxItems)
            let pending = documents!!
            if kind == SDLEventType.DropBegin {
                Reset()
            } else if kind == SDLEventType.DropFile {
                if rejected { return }
                var bytes int32 = 0
                guard let target = ReadUri(data, out bytes) else {
                    rejected = true
                    pending.Clear()
                    return
                }
                if pending.Count >= ApplicationActivation.MaxItems
                    || bytes > ApplicationActivation.MaxRequestBytes - textBytes {
                    rejected = true
                    pending.Clear()
                    return
                }
                textBytes += bytes
                pending.Add(target)
            } else if kind == SDLEventType.DropComplete {
                try {
                    if !rejected && pending.Count != 0 { Deliver(pending) }
                } finally {
                    Reset()
                }
            }
        }

        internal func Reset() {
            documents?.Clear()
            rejected = false
            textBytes = 0
        }

        private func ReadUri(data nint, out bytes int32) Uri? {
            bytes = 0
            if data == nint(0) { return nil }
            while bytes <= ApplicationActivation.MaxStringBytes && Marshal.ReadByte(data, bytes) != 0 { bytes++ }
            if bytes > ApplicationActivation.MaxStringBytes { return nil }
            let text = Marshal.PtrToStringUTF8(data, bytes)
            return if Uri.TryCreate(text, UriKind.Absolute, out var target) { target } else { nil }
        }

        private func Deliver(documents List[Uri]) {
            var filesOnly = true
            for document in documents {
                if !document.IsFile {
                    filesOnly = false
                    break
                }
            }
            let initial = Window.IsInitialApplicationActivation
            if filesOnly {
                Window.PostApplicationActivation(ApplicationActivation{
                    Kind: ApplicationActivationKind.OpenDocuments, IsInitial: initial, Documents: documents,
                })
                return
            }
            for document in documents {
                if document.IsFile {
                    Window.PostApplicationActivation(ApplicationActivation{
                        Kind: ApplicationActivationKind.OpenDocuments, IsInitial: initial,
                        Documents: []Uri{ document },
                    })
                } else {
                    Window.PostApplicationActivation(ApplicationActivation{
                        Kind: ApplicationActivationKind.OpenUri, IsInitial: initial, Target: document,
                    })
                }
            }
        }
    }
}
