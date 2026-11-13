package Goo

import System

/// Selects the software keyboard's input purpose.
public enum InputPurpose {
  /// Requests ordinary text.
  Text;
  /// Requests an email address.
  Email;
  /// Requests a URL.
  Url;
  /// Requests an integer.
  Number;
  /// Requests a decimal number.
  Decimal;
  /// Requests a telephone number.
  Phone;
  /// Requests search text.
  Search;
  /// Requests protected text. Use TextEntry for masked display.
  Password;
}

/// Selects the software keyboard's enter action.
public enum EnterAction {
  /// Submits and finishes editing.
  Done;
  /// Submits navigation input.
  Go;
  /// Moves focus to the next field.
  Next;
  /// Submits a search.
  Search;
  /// Submits a message.
  Send;
  /// Requests no submit action.
  None;
}

/// Supplies optional platform editing hints. Desktop hosts ignore these except entry password protection.
public class TextInputOptions {
  private var frozenOwner Type?
  private var purpose InputPurpose
  private var enterAction EnterAction
  private var autofillHints []string

  internal prop AutofillHintValues []string { get -> autofillHints }

  internal func Freeze(owner Type) { frozenOwner ??= owner }

  private func CheckMutable() {
    if let owner = frozenOwner {
      throw InvalidOperationException(owner.Name + " modified after it was returned to Goo")
    }
  }

  /// Gets the keyboard purpose. Defaults to Text.
  public prop Purpose InputPurpose {
    get -> purpose
    set {
      CheckMutable()
      purpose = value
    }
  }

  /// Gets the enter action. Defaults to Done.
  public prop EnterAction EnterAction {
    get -> enterAction
    set {
      CheckMutable()
      enterAction = value
    }
  }

  /// Gets platform autofill hint names, such as username, password or emailAddress.
  public prop AutofillHints []string {
    get {
      let copy = [autofillHints.Length]string
      Array.Copy(autofillHints, copy, autofillHints.Length)
      return copy
    }
    set {
      CheckMutable()
      let copy = [value.Length]string
      Array.Copy(value, copy, value.Length)
      autofillHints = copy
    }
  }

  /// Creates default text input options.
  public init() {
  }
}
