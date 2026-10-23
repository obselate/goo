package Goo

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
  /// Gets the keyboard purpose. Defaults to Text.
  public prop Purpose InputPurpose{ get; init; }

  /// Gets the enter action. Defaults to Done.
  public prop EnterAction EnterAction{ get; init; }

  /// Gets platform autofill hint names, such as username, password or emailAddress.
  public prop AutofillHints []string{ get; init; }

  /// Creates default text input options.
  public init() {
    AutofillHints = []string{}
  }
}
