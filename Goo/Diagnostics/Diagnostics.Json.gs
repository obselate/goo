package Goo

import System.Text.Json

internal class DiagnosticJson {
    shared {
        internal func Quote(value string) string {
            if value == nil {
                return "null"
            }
            return "\"" + JsonEncodedText.Encode(value).ToString() + "\""
        }
    }
}
