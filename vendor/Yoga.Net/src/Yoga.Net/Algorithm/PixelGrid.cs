using System;

namespace Facebook.Yoga
{
    public static class PixelGrid
    {
        public const float YGUndefined = float.NaN;

        public static float RoundValueToPixelGrid(
            double value,
            double pointScaleFactor,
            bool forceCeil,
            bool forceFloor) =>
            (float)RoundValueToPixelGridDouble(value, pointScaleFactor, forceCeil, forceFloor);

        private static double RoundValueToPixelGridDouble(
            double value,
            double pointScaleFactor,
            bool forceCeil,
            bool forceFloor)
        {
            double scaledValue = value * pointScaleFactor;
            double fractial = scaledValue % 1.0;

            if (fractial < 0)
            {
                fractial += 1.0;
            }

            if (Comparison.InexactEquals(fractial, 0.0))
            {
                scaledValue = scaledValue - fractial;
            }
            else if (Comparison.InexactEquals(fractial, 1.0))
            {
                scaledValue = scaledValue - fractial + 1.0;
            }
            else if (forceCeil)
            {
                scaledValue = scaledValue - fractial + 1.0;
            }
            else if (forceFloor)
            {
                scaledValue = scaledValue - fractial;
            }
            else
            {
                scaledValue = scaledValue - fractial +
                    (!double.IsNaN(fractial) &&
                         (fractial > 0.5 || Comparison.InexactEquals(fractial, 0.5))
                     ? 1.0
                     : 0.0);
            }

            return (double.IsNaN(scaledValue) || double.IsNaN(pointScaleFactor))
                ? double.NaN
                : scaledValue / pointScaleFactor;
        }

        public static void RoundLayoutResultsToPixelGrid(
            Node node,
            double absoluteLeft,
            double absoluteTop)
        {
            double scale = node.GetConfig()!.GetPointScaleFactor();
            bool parentText = node.GetOwner()?.GetNodeType() == NodeType.Text;
            RoundLayoutResultsToPixelGrid(node, absoluteLeft, absoluteTop, scale,
                (float)(scale == 0 ? absoluteLeft : RoundValueToPixelGridDouble(absoluteLeft, scale, false, parentText)),
                (float)(scale == 0 ? absoluteTop : RoundValueToPixelGridDouble(absoluteTop, scale, false, parentText)));
        }

        private static void RoundLayoutResultsToPixelGrid(
            Node node, double absoluteLeft, double absoluteTop, double pointScaleFactor,
            float snappedParentLeft, float snappedParentTop)
        {

            var layout = node.GetLayout();
            double nodeLeft = layout.RawLeft;
            double nodeTop = layout.RawTop;

            double nodeWidth = layout.RawDimension(Dimension.Width);
            double nodeHeight = layout.RawDimension(Dimension.Height);

            double absoluteNodeLeft = absoluteLeft + nodeLeft;
            double absoluteNodeTop = absoluteTop + nodeTop;

            double absoluteNodeRight = absoluteNodeLeft + nodeWidth;
            double absoluteNodeBottom = absoluteNodeTop + nodeHeight;
            double roundedNodeLeft = absoluteNodeLeft;
            double roundedNodeTop = absoluteNodeTop;

            if (pointScaleFactor != 0.0)
            {
                bool textRounding = node.GetNodeType() == NodeType.Text;
                bool parentTextRounding = node.GetOwner()?.GetNodeType() == NodeType.Text;

                roundedNodeLeft = RoundValueToPixelGridDouble(absoluteNodeLeft, pointScaleFactor, false, textRounding);
                roundedNodeTop = RoundValueToPixelGridDouble(absoluteNodeTop, pointScaleFactor, false, textRounding);
                layout.SetRoundedPosition(
                    (float)(roundedNodeLeft -
                        RoundValueToPixelGridDouble(absoluteLeft, pointScaleFactor, false, parentTextRounding)),
                    (float)(roundedNodeTop -
                        RoundValueToPixelGridDouble(absoluteTop, pointScaleFactor, false, parentTextRounding)));

                double scaledNodeWith = nodeWidth * pointScaleFactor;
                bool hasFractionalWidth =
                    !Comparison.InexactEquals(Math.Round(scaledNodeWith), scaledNodeWith);

                double scaledNodeHeight = nodeHeight * pointScaleFactor;
                bool hasFractionalHeight =
                    !Comparison.InexactEquals(Math.Round(scaledNodeHeight), scaledNodeHeight);

                double roundedWidth = textRounding
                    ? RoundValueToPixelGridDouble(nodeWidth, pointScaleFactor, true, false)
                    : RoundValueToPixelGridDouble(absoluteNodeRight, pointScaleFactor, false, false) -
                        roundedNodeLeft;
                double roundedHeight = textRounding
                    ? RoundValueToPixelGridDouble(nodeHeight, pointScaleFactor, true, false)
                    : RoundValueToPixelGridDouble(absoluteNodeBottom, pointScaleFactor, false, false) -
                        roundedNodeTop;

                node.GetLayout().SetDimension(
                    Dimension.Width,
                    (float)(roundedWidth == 0.0 && hasFractionalWidth && scaledNodeWith > 0.0
                        ? 1.0 / pointScaleFactor : roundedWidth));

                node.GetLayout().SetDimension(
                    Dimension.Height,
                    (float)(roundedHeight == 0.0 && hasFractionalHeight && scaledNodeHeight > 0.0
                        ? 1.0 / pointScaleFactor : roundedHeight));
            }

            float snappedNodeLeft = snappedParentLeft + layout.Position(PhysicalEdge.Left);
            float snappedNodeTop = snappedParentTop + layout.Position(PhysicalEdge.Top);
            var childCount = node.GetChildCount();
            for (nuint index = 0; index < childCount; index++)
            {
                var child = node.GetChild(index)!;
                RoundLayoutResultsToPixelGrid(child, absoluteNodeLeft, absoluteNodeTop,
                    child.GetConfig()!.GetPointScaleFactor(), snappedNodeLeft, snappedNodeTop);
            }

            if (pointScaleFactor == 0.0 || childCount == 0 || layout.ContentSizing == ContentSizing.None ||
                node.Style.Overflow == Overflow.Scroll)
                return;
            var contentAxes = layout.ContentSizing & ClippingAxes(node);
            if (contentAxes == ContentSizing.None)
                return;

            double left = layout.Border(PhysicalEdge.Left);
            double top = layout.Border(PhysicalEdge.Top);
            double right = (double)layout.Dimension(Dimension.Width) - layout.Border(PhysicalEdge.Right);
            double bottom = (double)layout.Dimension(Dimension.Height) - layout.Border(PhysicalEdge.Bottom);
            ExpandContentBounds(node, contentAxes, 0, 0, ref left, ref top, ref right, ref bottom);
            left = Math.Min(0, left - layout.Border(PhysicalEdge.Left));
            top = Math.Min(0, top - layout.Border(PhysicalEdge.Top));
            right = Math.Max(layout.Dimension(Dimension.Width), right + layout.Border(PhysicalEdge.Right));
            bottom = Math.Max(layout.Dimension(Dimension.Height), bottom + layout.Border(PhysicalEdge.Bottom));
            if (left < 0 || right > layout.Dimension(Dimension.Width))
            {
                if (left < 0)
                    left = RoundValueToPixelGridDouble(roundedNodeLeft + left, pointScaleFactor, false, true) - roundedNodeLeft;
                if (right > layout.Dimension(Dimension.Width))
                    right = RoundValueToPixelGridDouble(roundedNodeLeft + right, pointScaleFactor, true, false) - roundedNodeLeft;
            }
            if (top < 0 || bottom > layout.Dimension(Dimension.Height))
            {
                if (top < 0)
                    top = RoundValueToPixelGridDouble(roundedNodeTop + top, pointScaleFactor, false, true) - roundedNodeTop;
                if (bottom > layout.Dimension(Dimension.Height))
                    bottom = RoundValueToPixelGridDouble(roundedNodeTop + bottom, pointScaleFactor, true, false) - roundedNodeTop;
            }
            layout.SetDimension(Dimension.Width, (float)(right - left));
            layout.SetDimension(Dimension.Height, (float)(bottom - top));
            if (left == 0 && top == 0)
                return;

            layout.SetRoundedPosition(
                left == 0 ? layout.Position(PhysicalEdge.Left) :
                    (float)(roundedNodeLeft + left - snappedParentLeft),
                top == 0 ? layout.Position(PhysicalEdge.Top) :
                    (float)(roundedNodeTop + top - snappedParentTop));
            float shiftedNodeLeft = snappedParentLeft + layout.Position(PhysicalEdge.Left);
            float shiftedNodeTop = snappedParentTop + layout.Position(PhysicalEdge.Top);
            var children = new LayoutableChildren<Node>.Iterator(node);
            while (children.MoveNext())
            {
                var childLayout = children.Current.Layout;
                childLayout.SetRoundedPosition(
                    left == 0 ? childLayout.Position(PhysicalEdge.Left) :
                        (snappedNodeLeft + childLayout.Position(PhysicalEdge.Left)) - shiftedNodeLeft,
                    top == 0 ? childLayout.Position(PhysicalEdge.Top) :
                        (snappedNodeTop + childLayout.Position(PhysicalEdge.Top)) - shiftedNodeTop);
            }
        }

        private static ContentSizing ClippingAxes(Node node) =>
            node.ContentClipAxes ?? (node.Style.Overflow == Overflow.Visible
                ? ContentSizing.None : ContentSizing.Width | ContentSizing.Height);

        private static void ExpandContentBounds(
            Node node, ContentSizing axes, double offsetX, double offsetY,
            ref double left, ref double top, ref double right, ref double bottom)
        {
            var children = new LayoutableChildren<Node>.Iterator(node);
            while (children.MoveNext())
            {
                var child = children.Current;
                if (child.Style.Display == Display.None || child.Style.PositionType == PositionType.Absolute)
                    continue;
                var layout = child.Layout;
                double childLeft = offsetX + layout.Position(PhysicalEdge.Left);
                double childTop = offsetY + layout.Position(PhysicalEdge.Top);
                if ((axes & ContentSizing.Width) != 0)
                {
                    left = Math.Min(left, childLeft);
                    right = Math.Max(right, childLeft + layout.Dimension(Dimension.Width));
                }
                if ((axes & ContentSizing.Height) != 0)
                {
                    top = Math.Min(top, childTop);
                    bottom = Math.Max(bottom, childTop + layout.Dimension(Dimension.Height));
                }
                var visibleAxes = axes & ~ClippingAxes(child);
                if (visibleAxes != ContentSizing.None && child.GetChildCount() != 0)
                    ExpandContentBounds(child, visibleAxes, childLeft, childTop,
                        ref left, ref top, ref right, ref bottom);
            }
        }
    }
}
