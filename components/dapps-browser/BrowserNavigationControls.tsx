import {
  ArrowLeft,
  ArrowRight,
  Home,
  RotateCcw,
  Search,
} from "lucide-react-native";
import React from "react";
import { TouchableOpacity, View } from "react-native";

interface BrowserState {
  canGoBack: boolean;
  canGoForward: boolean;
}

interface BrowserNavigationControlsProps {
  browserState: BrowserState;
  onGoBack: () => void;
  onGoForward: () => void;
  onSearch: () => void;
  onRefresh: () => void;
  onHome: () => void;
}

export default function BrowserNavigationControls({
  browserState,
  onGoBack,
  onGoForward,
  onSearch,
  onRefresh,
  onHome,
}: BrowserNavigationControlsProps) {
  return (
    <View className="flex-row gap-3 px-4 py-2 bg-light-main-container items-center justify-center">
      <TouchableOpacity
        onPress={onGoBack}
        disabled={!browserState.canGoBack}
        activeOpacity={0.7}
        className={`w-12 h-12 rounded-2xl items-center justify-center ${
          browserState.canGoBack ? "bg-light" : "bg-light opacity-50"
        }`}
      >
        <ArrowLeft
          size={20}
          color={browserState.canGoBack ? "#c71c4b" : "#9CA3AF"}
          strokeWidth={2}
        />
      </TouchableOpacity>

      <TouchableOpacity
        onPress={onGoForward}
        disabled={!browserState.canGoForward}
        activeOpacity={0.7}
        className={`w-12 h-12 rounded-2xl items-center justify-center ${
          browserState.canGoForward ? "bg-light" : "bg-light opacity-50"
        }`}
      >
        <ArrowRight
          size={20}
          color={browserState.canGoForward ? "#c71c4b" : "#9CA3AF"}
          strokeWidth={2}
        />
      </TouchableOpacity>

      <TouchableOpacity
        onPress={onRefresh}
        activeOpacity={0.7}
        className="w-12 h-12 bg-light rounded-2xl items-center justify-center"
      >
        <RotateCcw size={20} color="#c71c4b" strokeWidth={2} />
      </TouchableOpacity>

      <TouchableOpacity
        onPress={onSearch}
        activeOpacity={0.7}
        className="w-12 h-12 bg-light rounded-2xl items-center justify-center"
      >
        <Search size={20} color="#c71c4b" strokeWidth={2} />
      </TouchableOpacity>

      <TouchableOpacity
        onPress={onHome}
        activeOpacity={0.7}
        className="w-12 h-12 bg-light rounded-2xl items-center justify-center"
      >
        <Home size={20} color="#c71c4b" strokeWidth={2} />
      </TouchableOpacity>
    </View>
  );
}
