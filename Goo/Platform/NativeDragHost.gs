package Goo

import System

internal struct NativeTransferResult {
  internal let Status DataTransferStatus
  internal let Effect DragEffect
  internal let SourceRemovalRequired bool
  internal let Error string

  internal init(status DataTransferStatus, effect DragEffect = DragEffect.None,
    sourceRemovalRequired bool = false, error string = "") {
    Status = status
    Effect = effect
    SourceRemovalRequired = sourceRemovalRequired
    Error = if error.Length <= 1024 { error } else { error.Substring(0, 1024) }
  }
}

internal interface NativeDragHost {
  func BeginNativeDrag(data TransferData, effects DragEffect, completed Action[NativeTransferResult]) NativeTransferResult;
  func CancelNativeDrag();
}
