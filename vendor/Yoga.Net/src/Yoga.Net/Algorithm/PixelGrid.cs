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
            var pointScaleFactor = (double)node.GetConfig()!.GetPointScaleFactor();

            var layout = node.GetLayout();
            double nodeLeft = layout.RawLeft;
            double nodeTop = layout.RawTop;

            double nodeWidth = layout.RawDimension(Dimension.Width);
            double nodeHeight = layout.RawDimension(Dimension.Height);

            double absoluteNodeLeft = absoluteLeft + nodeLeft;
            double absoluteNodeTop = absoluteTop + nodeTop;

            double absoluteNodeRight = absoluteNodeLeft + nodeWidth;
            double absoluteNodeBottom = absoluteNodeTop + nodeHeight;

            if (pointScaleFactor != 0.0)
            {
                bool textRounding = node.GetNodeType() == NodeType.Text;
                bool parentTextRounding = node.GetOwner()?.GetNodeType() == NodeType.Text;

                layout.SetRoundedPosition(
                    (float)(RoundValueToPixelGridDouble(absoluteNodeLeft, pointScaleFactor, false, textRounding) -
                        RoundValueToPixelGridDouble(absoluteLeft, pointScaleFactor, false, parentTextRounding)),
                    (float)(RoundValueToPixelGridDouble(absoluteNodeTop, pointScaleFactor, false, textRounding) -
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
                        RoundValueToPixelGridDouble(absoluteNodeLeft, pointScaleFactor, false, false);
                double roundedHeight = textRounding
                    ? RoundValueToPixelGridDouble(nodeHeight, pointScaleFactor, true, false)
                    : RoundValueToPixelGridDouble(absoluteNodeBottom, pointScaleFactor, false, false) -
                        RoundValueToPixelGridDouble(absoluteNodeTop, pointScaleFactor, false, false);

                node.GetLayout().SetDimension(
                    Dimension.Width,
                    (float)(roundedWidth == 0.0 && hasFractionalWidth && scaledNodeWith > 0.0
                        ? 1.0 / pointScaleFactor : roundedWidth));

                node.GetLayout().SetDimension(
                    Dimension.Height,
                    (float)(roundedHeight == 0.0 && hasFractionalHeight && scaledNodeHeight > 0.0
                        ? 1.0 / pointScaleFactor : roundedHeight));
            }

            var childCount = node.GetChildCount();
            for (nuint index = 0; index < childCount; index++)
            {
                var child = node.GetChild(index)!;
                RoundLayoutResultsToPixelGrid(child, absoluteNodeLeft, absoluteNodeTop);
            }

            if (pointScaleFactor == 0.0 || childCount == 0 || layout.ContentSizing == ContentSizing.None ||
                node.Style.Overflow == Overflow.Scroll)
                return;

            float left = 0, top = 0;
            float right = layout.Dimension(Dimension.Width);
            float bottom = layout.Dimension(Dimension.Height);
            bool contentWidth = (layout.ContentSizing & ContentSizing.Width) != 0;
            bool contentHeight = (layout.ContentSizing & ContentSizing.Height) != 0;
            float leadingX = contentWidth ? RoundValueToPixelGrid(
                layout.Padding(PhysicalEdge.Left) + layout.Border(PhysicalEdge.Left), pointScaleFactor, true, false) : 0;
            float trailingX = contentWidth ? RoundValueToPixelGrid(
                layout.Padding(PhysicalEdge.Right) + layout.Border(PhysicalEdge.Right), pointScaleFactor, true, false) : 0;
            float leadingY = contentHeight ? RoundValueToPixelGrid(
                layout.Padding(PhysicalEdge.Top) + layout.Border(PhysicalEdge.Top), pointScaleFactor, true, false) : 0;
            float trailingY = contentHeight ? RoundValueToPixelGrid(
                layout.Padding(PhysicalEdge.Bottom) + layout.Border(PhysicalEdge.Bottom), pointScaleFactor, true, false) : 0;
            var children = new LayoutableChildren<Node>.Iterator(node);
            while (children.MoveNext())
            {
                var child = children.Current;
                if (child.Style.Display == Display.None || child.Style.PositionType == PositionType.Absolute)
                    continue;
                var childLayout = child.Layout;
                if (contentWidth)
                {
                    left = Math.Min(left, childLayout.Position(PhysicalEdge.Left) - leadingX);
                    right = Math.Max(right, childLayout.Position(PhysicalEdge.Left) +
                        childLayout.Dimension(Dimension.Width) + trailingX);
                }
                if (contentHeight)
                {
                    top = Math.Min(top, childLayout.Position(PhysicalEdge.Top) - leadingY);
                    bottom = Math.Max(bottom, childLayout.Position(PhysicalEdge.Top) +
                        childLayout.Dimension(Dimension.Height) + trailingY);
                }
            }
            layout.SetDimension(Dimension.Width, right - left);
            layout.SetDimension(Dimension.Height, bottom - top);
            if (left == 0 && top == 0)
                return;

            layout.SetRoundedPosition(
                layout.Position(PhysicalEdge.Left) + left, layout.Position(PhysicalEdge.Top) + top);
            children = new LayoutableChildren<Node>.Iterator(node);
            while (children.MoveNext())
            {
                var childLayout = children.Current.Layout;
                childLayout.SetRoundedPosition(
                    childLayout.Position(PhysicalEdge.Left) - left, childLayout.Position(PhysicalEdge.Top) - top);
            }
        }
    }
}
