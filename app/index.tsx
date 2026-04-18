import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  BackHandler,
  Dimensions,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import HomeMain from "@/components/home/Main/HomeMain";
import ScanToPayChatModeFloatingButtons from "@/components/home/Main/ScanToPayChatModeFloatingButtons";
import AgentMode from "@/components/home/TakumiAgent/AgentMode";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

export default function Home() {
  const scrollViewRef = useRef<ScrollView>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  // Track if agent mode has ever been opened to keep it mounted once visited
  const [hasVisitedAgentMode, setHasVisitedAgentMode] = useState(false);

  const scrollToIndex = useCallback((index: number) => {
    scrollViewRef.current?.scrollTo({
      x: SCREEN_WIDTH * index,
      animated: true,
    });
    setCurrentIndex(index);
  }, []);

  // AgentMode is a ~15-useEffect, reanimated-heavy tree whose first
  // mount costs several hundred ms. We used to pre-mount it via
  // `InteractionManager.runAfterInteractions` right after home idled —
  // but post-unlock that fired while the user's first taps were still
  // in flight and contributed to the "app freeze after unlock" bug.
  // Mount on actual navigation instead. The first tap to switch into
  // chat mode will pay a small lag; every subsequent tap is instant.
  const handleChatModePress = useCallback(() => {
    setHasVisitedAgentMode(true);
    scrollToIndex(1);
  }, [scrollToIndex]);

  useEffect(() => {
    const backHandler = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        if (currentIndex === 1) {
          scrollToIndex(0);
          return true;
        }
        return false;
      },
    );

    return () => backHandler.remove();
  }, [currentIndex, scrollToIndex]);

  const { bottom } = useSafeAreaInsets();
  const bottomOffset = Platform.OS === "ios" ? 0 : bottom > 0 ? bottom : 0;
  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="#f5f6f9" />
      <SafeAreaView style={[styles.container]} edges={["top"]}>
        <ScrollView
          ref={scrollViewRef}
          horizontal={true}
          scrollEnabled={false}
          pagingEnabled={true}
          showsHorizontalScrollIndicator={false}
          style={styles.horizontalScroll}
          contentContainerStyle={{ paddingBottom: bottomOffset }}
        >
          <View style={{ width: SCREEN_WIDTH }}>
            <HomeMain />
          </View>
          <View style={{ width: SCREEN_WIDTH }}>
            {hasVisitedAgentMode && <AgentMode />}
          </View>
        </ScrollView>

        {currentIndex === 0 && (
          <ScanToPayChatModeFloatingButtons
            onChatModePress={handleChatModePress}
          />
        )}
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f6f9",
  },
  horizontalScroll: {
    flex: 1,
  },
});
