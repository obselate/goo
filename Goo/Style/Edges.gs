package Goo

/// Specifies CSS-style top, right, bottom, and left lengths.
/// One value applies to all edges. Two values mean vertical and horizontal.
/// Three values mean top, horizontal, and bottom.
public struct Edges {
    private var top Length
    private var right Length
    private var bottom Length
    private var left Length
    private var setTop bool
    private var setRight bool
    private var setBottom bool
    private var setLeft bool
    private var uniformValue Length
    internal var Uniform bool

    /// Sets the top edge independently.
    public prop Top Length {
        get -> setTop ? top: uniformValue
        init {
            top = value
            setTop = true
        }
    }
    /// Sets the right edge independently.
    public prop Right Length {
        get -> setRight ? right: uniformValue
        init {
            right = value
            setRight = true
        }
    }
    /// Sets the bottom edge independently.
    public prop Bottom Length {
        get -> setBottom ? bottom: uniformValue
        init {
            bottom = value
            setBottom = true
        }
    }
    /// Sets the left edge independently.
    public prop Left Length {
        get -> setLeft ? left: uniformValue
        init {
            left = value
            setLeft = true
        }
    }

    internal prop HasTop bool {
        get -> setTop
    }
    internal prop HasRight bool {
        get -> setRight
    }
    internal prop HasBottom bool {
        get -> setBottom
    }
    internal prop HasLeft bool {
        get -> setLeft
    }
    internal prop UniformValue Length {
        get -> uniformValue
    }

    /// Applies one length to every edge.
    /// @param all length for every edge
    public init(all Length) {
        uniformValue = all
        Uniform = true
    }

    /// Applies one length vertically and another horizontally.
    /// @param vertical top and bottom length
    /// @param horizontal right and left length
    public init(vertical Length, horizontal Length) {
        Top = vertical
        Right = horizontal
        Bottom = vertical
        Left = horizontal
    }

    /// Applies top, horizontal, and bottom lengths.
    /// @param top top length
    /// @param horizontal right and left length
    /// @param bottom bottom length
    public init(top Length, horizontal Length, bottom Length) {
        Top = top
        Right = horizontal
        Bottom = bottom
        Left = horizontal
    }

    /// Applies top, right, bottom, and left lengths in CSS order.
    /// @param top top length
    /// @param right right length
    /// @param bottom bottom length
    /// @param left left length
    public init(top Length, right Length, bottom Length, left Length) {
        Top = top
        Right = right
        Bottom = bottom
        Left = left
    }
}

/// Converts a length into a uniform edge value.
/// @param value length for every edge
/// @returns a uniform edge value
public func operator implicit(value Length) Edges -> Edges(value)

/// Converts integer pixels into a uniform edge value.
/// @param value pixel length for every edge
/// @returns a uniform edge value
public func operator implicit(value int32) Edges -> Edges(Length{Unit: LengthUnit.Px, Value: float32(value)})

/// Converts pixel values into a uniform edge value.
/// @param value pixel length for every edge
/// @returns a uniform edge value
public func operator implicit(value float64) Edges -> Edges(Length{Unit: LengthUnit.Px, Value: float32(value)})
