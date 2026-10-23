package Goo

import System

internal interface EmbeddedPopupSurface : IDisposable {
  func Open(anchor ElementRect, width int32, height int32, placement PortalPlacement) PopupResult;
  func UpdatePlacement(anchor ElementRect, width int32, height int32, placement PortalPlacement) WindowOperationResult;
  func RequestClose();
}
