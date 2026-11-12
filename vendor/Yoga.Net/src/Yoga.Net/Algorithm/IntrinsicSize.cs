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
                var width = axis == Dimension.Width ? (minimum ? 0 : float.NaN) : ownerWidth;
                CalculateLayoutInternal(node, width, float.NaN, node.ResolveDirection(Direction.Inherit),
                    axis == Dimension.Width && !minimum ? SizingMode.MaxContent : SizingMode.FitContent,
                    SizingMode.MaxContent, ownerWidth, ownerHeight, false,
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
