import React from 'react';
import { Svg, Path, Circle } from 'react-native-svg';
import { cssInterop } from 'nativewind';
cssInterop(Svg, {
  className: {
    target: 'style',
    nativeStyleToProp: { width: true, height: true }
  }
});
cssInterop(Circle, {
  className: {
    target: 'style',
    nativeStyleToProp: { width: true, height: true }
  }
});
cssInterop(Path, {
  className: {
    target: 'style',
    nativeStyleToProp: { width: true, height: true }
  }
});

const Spin = () => (
  <Svg
    className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
  >
    <Circle
      className="opacity-25"
      cx="12"
      cy="12"
      r="10"
      stroke="currentColor"
      strokeWidth="4"
    ></Circle>
    <Path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    ></Path>
  </Svg>
);

export default Spin;
