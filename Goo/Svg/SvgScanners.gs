package Goo.Svg

import System.Collections.Generic
import System.Globalization
import System.Xml.Linq

internal class SvgNumberScanner {
    private let text string
    private let owner XElement
    private let field string
    private var index int32

    internal init(text string, owner XElement, field string) {
        this.text = text
        this.owner = owner
        this.field = field
    }

    internal func TryRead(out value float64) bool {
        SkipSeparators()
        if index >= text.Length {
            value = 0.0
            return false
        }
        let start = index
        if (text[index] is '+' or '-') {
            index++
        }
        var digits = 0
        while index < text.Length && char.IsDigit(text[index]) {
            index++
            digits++
        }
        if index < text.Length && text[index] == '.' {
            index++
            while index < text.Length && char.IsDigit(text[index]) {
                index++
                digits++
            }
        }
        if digits == 0 {
            throw SvgParser.Fail(owner, "$field contains an invalid number")
        }
        if index < text.Length && (text[index] is 'e' or 'E') {
            index++
            if index < text.Length && (text[index] is '+' or '-') {
                index++
            }
            var exponentDigits = 0
            while index < text.Length && char.IsDigit(text[index]) {
                index++
                exponentDigits++
            }
            if exponentDigits == 0 {
                throw SvgParser.Fail(owner, "$field contains an invalid exponent")
            }
        }
        if !float64.TryParse(text[start .. index], NumberStyles.Float, CultureInfo.InvariantCulture, out value) ||
            !float64.IsFinite(value) {
            throw SvgParser.Fail(owner, "$field contains a non-finite number")
        }
        return true
    }

    private func SkipSeparators() {
        while index < text.Length && (char.IsWhiteSpace(text[index]) || text[index] == ',') {
            index++
        }
    }
}

internal class SvgTransformScanner {
    private let text string
    private let owner XElement
    private var index int32

    internal init(text string, owner XElement) {
        this.text = text
        this.owner = owner
    }

    internal func TryReadName(out name string) bool {
        SkipSeparators()
        if index >= text.Length {
            name = ""
            return false
        }
        let start = index
        while index < text.Length && char.IsLetter(text[index]) {
            index++
        }
        if start == index || index >= text.Length || text[index] != '(' {
            throw SvgParser.Fail(owner, "invalid transform list")
        }
        name = text[start .. index].ToLowerInvariant()
        index++
        return true
    }

    internal func ReadArguments() List[float64] {
        let values = List[float64]()
        while true {
            while index < text.Length && (char.IsWhiteSpace(text[index]) || text[index] == ',') {
                index++
            }
            if index >= text.Length {
                throw SvgParser.Fail(owner, "unterminated transform")
            }
            if text[index] == ')' {
                index++
                return values
            }
            values.Add(ReadNumber())
        }
    }

    private func ReadNumber() float64 {
        let start = index
        if index < text.Length && (text[index] is '+' or '-') {
            index++
        }
        var digits = 0
        while index < text.Length && char.IsDigit(text[index]) {
            index++
            digits++
        }
        if index < text.Length && text[index] == '.' {
            index++
            while index < text.Length && char.IsDigit(text[index]) {
                index++
                digits++
            }
        }
        if digits == 0 {
            throw SvgParser.Fail(owner, "invalid transform number")
        }
        if index < text.Length && (text[index] is 'e' or 'E') {
            index++
            if index < text.Length && (text[index] is '+' or '-') {
                index++
            }
            var exponentDigits = 0
            while index < text.Length && char.IsDigit(text[index]) {
                index++
                exponentDigits++
            }
            if exponentDigits == 0 {
                throw SvgParser.Fail(owner, "invalid transform exponent")
            }
        }
        if !float64.TryParse(text[start .. index], NumberStyles.Float, CultureInfo.InvariantCulture, out var value) ||
            !float64.IsFinite(value) {
            throw SvgParser.Fail(owner, "transform contains a non-finite number")
        }
        return value
    }

    internal func RequireEnd() {
        SkipSeparators()
        if index != text.Length {
            throw SvgParser.Fail(owner, "invalid transform list")
        }
    }

    private func SkipSeparators() {
        while index < text.Length && (char.IsWhiteSpace(text[index]) || text[index] == ',') {
            index++
        }
    }
}
