package Goo

import System

/// Reports that a window has no usable Vulkan device, surface or required graphics feature.
public class GraphicsUnavailableException : Exception {
    /// Creates a graphics startup failure with its native detail.
    /// @param message The graphics failure detail.
    public init(message string) : base(message) {}

    /// Creates a graphics startup failure that retains the underlying error.
    /// @param message The graphics failure detail.
    /// @param innerException The underlying renderer initialization error.
    public init(message string, innerException Exception) : base(message, innerException) {}
}
