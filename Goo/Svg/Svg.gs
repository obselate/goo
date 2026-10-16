package Goo.Svg

import Goo
import System
import System.IO

/// Reports invalid or unsupported SVG content.
public sealed class SvgParseException : FormatException {
    /// Creates an SVG parse failure with an optional inner exception.
    public init(message string, innerException Exception? = nil) : base(message, innerException) { }
}

/// Loads SVG sources as reusable vector assets.
public sealed class Svg {
    private init() { }

    shared {
        /// Parses SVG text into a vector asset.
        /// @exception ArgumentNullException when source is nil.
        /// @exception SvgParseException when the SVG is invalid or unsupported.
        public func Parse(source string) VectorAsset {
            ArgumentNullException.ThrowIfNull(source, paramName: "source")
            return SvgParser.ParseText(source)
        }

        /// Loads SVG from the current stream position and leaves the stream open.
        /// @exception ArgumentNullException when stream is nil.
        /// @exception SvgParseException when reading or parsing fails.
        public func Load(stream Stream) VectorAsset {
            ArgumentNullException.ThrowIfNull(stream, paramName: "stream")
            return SvgParser.LoadStream(stream, "<stream>")
        }

        /// Loads an SVG file into a vector asset.
        /// @exception ArgumentException when path is empty or whitespace.
        /// @exception ArgumentNullException when path is nil.
        /// @exception SvgParseException when reading or parsing fails.
        public func Load(path string) VectorAsset {
            ArgumentException.ThrowIfNullOrWhiteSpace(path, paramName: "path")
            return SvgParser.LoadFile(path)
        }
    }
}
