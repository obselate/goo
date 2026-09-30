package Goo

import System

internal interface NativeFileDragHost {
  prop LogicalWidth int32 { get; }
  prop LogicalHeight int32 { get; }
  func BeginNativeFileDrag(files NativeFileDrag, completed Action[bool]) bool;
  func CancelNativeFileDrag();
}
