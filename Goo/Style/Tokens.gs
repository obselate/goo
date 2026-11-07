package Goo

import System
import System.Collections.Generic

/// Provides typed lexical context to synchronous component functions.
/// A scope ends when its body returns and does not flow into later Cell builds.
public class Tokens {
  private init() {
  }

  shared {
    /// Runs a synchronous component body with tokens active only until the body returns.
    /// @typeparam T The token-set type.
    /// @typeparam R The result type.
    /// @param tokens The token set to make active.
    /// @param body The synchronous body to run while the token set is active.
    /// @returns The value returned by the body.
    public func Scope[T, R](tokens T, body Func[R]) R {
      TokenScope[T].Push(tokens)
      try {
        return body()
      } finally {
        TokenScope[T].Pop()
      }
    }

    /// Gets the token set active in the current synchronous scope.
    /// @typeparam T The token-set type.
    /// @returns The active token set.
    public func Get[T]() T -> TokenScope[T].Get()
  }
}

internal class TokenScope[T] {
  shared {
    @ThreadStatic
    private var stack Stack[T]?

    internal func Push(tokens T) {
      if stack == nil {
        stack = Stack[T]()
      }
      stack!!.Push(tokens)
    }

    internal func Pop() {
      stack!!.Pop()
    }

    internal func Get() T {
      if stack == nil || stack!!.Count == 0 {
        throw InvalidOperationException("No active token set for the requested type.")
      }
      return stack!!.Peek()
    }
  }
}
