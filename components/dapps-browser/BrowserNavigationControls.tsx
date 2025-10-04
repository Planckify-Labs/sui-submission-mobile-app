import {
  ArrowLeft,
  ArrowRight,
  Home,
  RotateCcw,
  Search,
} from "lucide-react-native";
import React, { memo, useCallback } from "react";
import { TouchableOpacity, View } from "react-native";
import { COLORS, ICON_SIZES } from "../../constants/dapps-browser";
import { TBrowserNavigationControlsProps } from "../../types/dapps-browser";
import { getButtonStyle, getIconColor } from "../../utils/dappsBrowserUtils";

const BrowserNavigationControls = memo<TBrowserNavigationControlsProps>(
  function BrowserNavigationControls({
    browserState,
    onGoBack,
    onGoForward,
    onSearch,
    onRefresh,
    onHome,
  }: TBrowserNavigationControlsProps) {
    const handleGoBack = useCallback(() => {
      if (browserState.canGoBack) {
        onGoBack();
      }
    }, [browserState.canGoBack, onGoBack]);

    const handleGoForward = useCallback(() => {
      if (browserState.canGoForward) {
        onGoForward();
      }
    }, [browserState.canGoForward, onGoForward]);

    return (
      <View className="flex-row gap-3 px-4 py-2 bg-light-main-container items-center justify-center">
        <TouchableOpacity
          onPress={handleGoBack}
          disabled={!browserState.canGoBack}
          activeOpacity={0.7}
          className={getButtonStyle(browserState.canGoBack)}
        >
          <ArrowLeft
            size={ICON_SIZES.MEDIUM}
            color={getIconColor(browserState.canGoBack)}
            strokeWidth={2}
          />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleGoForward}
          disabled={!browserState.canGoForward}
          activeOpacity={0.7}
          className={getButtonStyle(browserState.canGoForward)}
        >
          <ArrowRight
            size={ICON_SIZES.MEDIUM}
            color={getIconColor(browserState.canGoForward)}
            strokeWidth={2}
          />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onRefresh}
          activeOpacity={0.7}
          className={getButtonStyle(true, "secondary")}
        >
          <RotateCcw
            size={ICON_SIZES.MEDIUM}
            color={COLORS.PRIMARY_RED}
            strokeWidth={2}
          />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onSearch}
          activeOpacity={0.7}
          className={getButtonStyle(true, "secondary")}
        >
          <Search
            size={ICON_SIZES.MEDIUM}
            color={COLORS.PRIMARY_RED}
            strokeWidth={2}
          />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onHome}
          activeOpacity={0.7}
          className={getButtonStyle(true, "secondary")}
        >
          <Home
            size={ICON_SIZES.MEDIUM}
            color={COLORS.PRIMARY_RED}
            strokeWidth={2}
          />
        </TouchableOpacity>
      </View>
    );
  },
);

export default BrowserNavigationControls;
