package Goo

import System
import System.Diagnostics
import System.IO
import System.Threading
import System.Threading.Tasks

/// Reports whether the system handler was started.
public enum PlatformOpenStatus { Success; Unsupported; Failed }

/// Contains a system-handler launch outcome.
public sealed class PlatformOpenResult {
  /// Gets the launch outcome, not confirmation that the target was opened.
  public prop Status PlatformOpenStatus { get; }
  /// Gets native failure detail, or an empty string.
  public prop Error string { get; }
  internal init(status PlatformOpenStatus, error string = "") {
    Status = status
    Error = error
  }
}

/// Provides operating-system services without a window owner.
public sealed class Platform {
  private init() { }

  shared {
    /// Starts the system handler for an absolute path or URI on a background child.
    /// @param target An absolute path or URI. Relative paths are rejected.
    /// @param cancellationToken Cancels launch before the handler is started.
    /// @returns Success when the handler starts, or an explicit platform failure.
    public func OpenAsync(target string, cancellationToken CancellationToken = default(CancellationToken)) Task[PlatformOpenResult] {
      if target == nil { throw ArgumentNullException("target") }
      var uri Uri?
      if !Path.IsPathFullyQualified(target) && !Uri.TryCreate(target, UriKind.Absolute, out uri) {
        throw ArgumentException("The target must be an absolute path or URI", "target")
      }
      let completion = TaskCompletionSource[PlatformOpenResult](TaskCreationOptions.RunContinuationsAsynchronously)
      go Open(target, cancellationToken, completion)
      return completion.Task
    }

    private func Open(target string, token CancellationToken, completion TaskCompletionSource[PlatformOpenResult]) {
      try {
        token.ThrowIfCancellationRequested()
        if !OperatingSystem.IsWindows() && !OperatingSystem.IsMacOS() && !OperatingSystem.IsLinux() {
          completion.SetResult(PlatformOpenResult(PlatformOpenStatus.Unsupported))
          return
        }
        let start = if OperatingSystem.IsWindows() { ProcessStartInfo{FileName: target, UseShellExecute: true} }
          else { ProcessStartInfo{FileName: if OperatingSystem.IsMacOS() { "open" } else { "xdg-open" }} }
        if !OperatingSystem.IsWindows() { start.ArgumentList.Add(target) }
        token.ThrowIfCancellationRequested()
        using let process = Process.Start(start)
        completion.SetResult(PlatformOpenResult(PlatformOpenStatus.Success))
      } catch (_ OperationCanceledException) {
        completion.SetCanceled(token)
      } catch (error Exception) {
        completion.SetResult(PlatformOpenResult(PlatformOpenStatus.Failed, error.Message))
      }
    }
  }
}
