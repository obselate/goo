namespace Facebook.Yoga
{
    public static partial class LayoutAlgorithm
    {
        public static float MeasureIntrinsicSize(Node node, Dimension axis, bool minimum,
            float ownerWidth, float ownerHeight)
        {
            var dimension = node.Style.Dimension(axis);
            var min = node.Style.MinDimension(axis);
            var max = node.Style.MaxDimension(axis);
            var basis = node.Style.FlexBasis;
            try
            {
                node.Style.SetDimension(axis, StyleSizeLength.OfAuto());
                node.Style.SetMinDimension(axis, StyleSizeLength.Undefined());
                node.Style.SetMaxDimension(axis, StyleSizeLength.Undefined());
                node.Style.FlexBasis = StyleSizeLength.OfAuto();
                node.MarkDirtyAndPropagate();
                node.ProcessDimensions();
                var data = new LayoutData();
                var direction = node.ResolveDirection(Direction.Inherit);
                var cross = axis == Dimension.Width ? Dimension.Height : Dimension.Width;
                var crossOwner = cross == Dimension.Width ? ownerWidth : ownerHeight;
                var crossAxis = cross == Dimension.Width ? FlexDirection.Row : FlexDirection.Column;
                var definiteCross = node.HasDefiniteLength(cross, crossOwner);
                var crossSize = definiteCross
                    ? node.GetResolvedDimension(direction, cross, crossOwner, ownerWidth).Unwrap() +
                        node.Style.ComputeMarginForAxis(crossAxis, ownerWidth)
                    : axis == Dimension.Height ? ownerWidth : float.NaN;
                var crossMode = definiteCross ? SizingMode.StretchFit
                    : float.IsNaN(crossSize) ? SizingMode.MaxContent : SizingMode.FitContent;
                var width = axis == Dimension.Width ? (minimum ? 0 : float.NaN) : crossSize;
                var height = axis == Dimension.Height ? float.NaN : crossSize;
                CalculateLayoutInternal(node, width, height, direction,
                    axis == Dimension.Width ? (minimum ? SizingMode.FitContent : SizingMode.MaxContent) : crossMode,
                    axis == Dimension.Height ? SizingMode.MaxContent : crossMode, ownerWidth, ownerHeight, false,
                    LayoutPassReason.MeasureChild, ref data, 0, ++gCurrentGenerationCount);
                return node.Layout.MeasuredDimension(axis);
            }
            finally
            {
                node.Style.SetDimension(axis, dimension);
                node.Style.SetMinDimension(axis, min);
                node.Style.SetMaxDimension(axis, max);
                node.Style.FlexBasis = basis;
                node.ProcessDimensions();
            }
        }
    }
}
