package GooGallery

import Goo

class GalleryPosterTransitions {
    shared {
        internal let Frame[]TransitionProperty = []TransitionProperty{
            TransitionProperty.Width,
            TransitionProperty.Height,
        }
        internal let Module[]TransitionProperty = []TransitionProperty{
            TransitionProperty.Height,
            TransitionProperty.FlexBasis,
        }
        internal let Marker[]TransitionProperty = []TransitionProperty{
            TransitionProperty.Width,
            TransitionProperty.Height,
            TransitionProperty.BorderRadius,
        }
        internal let Type[]TransitionProperty = []TransitionProperty{TransitionProperty.FontSize}
    }
}
