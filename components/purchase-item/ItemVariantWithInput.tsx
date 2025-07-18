import OptionSelectorModal from "@/components/common/OptionSelectorModal";
import {
  useProductById,
  useProductInputFields,
} from "@/hooks/queries/useProducts";
import useRQGlobalState from "@/hooks/useRQGlobalState";
import { FlashList } from "@shopify/flash-list";
import { router } from "expo-router";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Info,
} from "lucide-react-native";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Image,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import ItemVariantWithInputSkeleton from "./ItemVariantWithInputSkeleton";

interface ItemVariantWithInputProps {
  productId?: string;
}

type TInputField = {
  key: string;
  type: string;
  alias: string;
  options?: string[];
};

type ProductVariant = {
  id: string;
  name: string;
  description: string;
  ProductPrice: Array<{
    sellPrice: string;
  }>;
};

export default function ItemWithInput({
  productId,
}: ItemVariantWithInputProps) {
  const isMounted = useRef(true);
  const {
    data: product,
    isLoading: isProductLoading,
    error: productError,
  } = useProductById(productId || "");
  const { data: inputFields, isLoading: isInputFieldsLoading } =
    useProductInputFields(productId || "");
  const isLoading = isProductLoading || isInputFieldsLoading;
  const error = productError;

  const { data: inputValues, setNewData: setInputValues } = useRQGlobalState<
    Record<string, string>
  >({
    queryKey: ["product-input-values", productId],
    initialData: {},
  });

  const [modalVisible, setModalVisible] = useState(false);
  const [activeField, setActiveField] = useState<TInputField | null>(null);
  const [isScrolling, setIsScrolling] = useState(false);
  const [isAtTop, setIsAtTop] = useState(true);
  const scrollViewRef = useRef<ScrollView>(null);
  const scrollButtonOpacity = useRef(new Animated.Value(0)).current;

  const ITEM_MARGIN = 8;

  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (inputFields?.forms && inputValues) {
      const initialValues = { ...inputValues };
      let needsUpdate = false;

      inputFields.forms.forEach((field) => {
        if (initialValues[field.key] === undefined) {
          initialValues[field.key] = "";
          needsUpdate = true;
        }
      });

      if (needsUpdate) {
        setInputValues(initialValues);
      }
    }
  }, [inputFields, inputValues, setInputValues]);

  const getKeyboardType = (inputType: string) => {
    switch (inputType.toUpperCase()) {
      case "NUMBER":
      case "NUMERIC":
        return "number-pad";
      case "EMAIL":
        return "email-address";
      case "PHONE":
        return "phone-pad";
      default:
        return "default";
    }
  };

  const handleInputChange = (key: string, value: string) => {
    if (inputValues) {
      setInputValues({
        ...inputValues,
        [key]: value,
      });
    }
  };

  const openOptionModal = (field: TInputField) => {
    setActiveField(field);
    setModalVisible(true);
  };

  const handleOptionSelect = (option: string) => {
    if (activeField && inputValues) {
      handleInputChange(activeField.key, option);
    }
  };

  const handleCloseModal = () => {
    setModalVisible(false);
  };

  const renderInputField = (field: TInputField) => {
    if (!inputValues) return null;

    if (
      field.type.toLowerCase() === "option" &&
      field.options &&
      field.options.length > 0
    ) {
      return (
        <View className="mb-4">
          <Text className="text-light-matte-black/70 mb-2">{field.alias}</Text>
          <TouchableOpacity
            className="bg-light-main-container p-4 rounded-xl flex-row items-center justify-between"
            onPress={() => openOptionModal(field)}
            activeOpacity={0.7}
          >
            <View className="flex-1">
              <Text className="text-light-matte-black font-medium text-lg">
                {inputValues[field.key] || `${field.alias.toLowerCase()}`}
              </Text>
              <Text className="text-light-matte-black/60 text-xs">
                {product?.category?.name}
              </Text>
            </View>
            <ChevronDown color="#333" size={20} />
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View className="mb-4">
        <Text className="text-light-matte-black/70 mb-2">{field.alias}</Text>
        <View className="bg-light-main-container p-4 rounded-xl flex-row items-center justify-between">
          <View className="flex-1">
            <TextInput
              value={inputValues[field.key] || ""}
              onChangeText={(value) => handleInputChange(field.key, value)}
              placeholder={`${field.alias.toLowerCase()}`}
              keyboardType={getKeyboardType(field.type)}
              className="text-light-matte-black font-medium text-lg"
              autoCapitalize="none"
            />
            <Text className="text-light-matte-black/60 text-xs">
              {product?.category?.name}
            </Text>
          </View>
          <View className="flex-row items-center">
            <Image
              source={{ uri: product?.imageUrl }}
              className="w-8 h-8 mr-2"
              style={{ resizeMode: "contain" }}
            />
          </View>
        </View>
      </View>
    );
  };

  const areAllInputsFilled = () => {
    if (!inputValues) return false;
    return Object.values(inputValues).every((value) => !!value);
  };

  const renderVariantItem = ({ item: variant }: { item: ProductVariant }) => {
    const price = variant.ProductPrice[0]?.sellPrice || "N/A";
    return (
      <TouchableOpacity
        key={variant.id}
        style={{ marginVertical: ITEM_MARGIN }}
        className="bg-light-main-container border border-light-matte-black/10 rounded-xl p-4"
        onPress={() => {
          if (
            inputValues &&
            Object.values(inputValues).every((value) => !!value)
          ) {
            router.push({
              pathname: "/payment",
              params: {
                variantId: variant.id,
                ...inputValues,
              },
            });
          }
        }}
        activeOpacity={0.7}
      >
        <View className="flex-row justify-between items-center">
          <View className="flex-1">
            <Text className="text-light-matte-black font-bold text-base">
              {variant.name}
            </Text>
            <Text className="text-light-matte-black/70 text-xs mt-1">
              {variant.description}
            </Text>
          </View>
          <Text className="text-light-primary-red font-bold text-base ml-2">
            Rp{parseInt(price).toLocaleString("id-ID")}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetY = event.nativeEvent.contentOffset.y;
    const isCurrentlyAtTop = offsetY < 10;

    if (isCurrentlyAtTop !== isAtTop) {
      setIsAtTop(isCurrentlyAtTop);
    }

    if (!isScrolling) {
      setIsScrolling(true);
      Animated.timing(scrollButtonOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();

      setTimeout(() => {
        setIsScrolling(false);
        Animated.timing(scrollButtonOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }).start();
      }, 3000);
    }
  };

  const scrollToPosition = () => {
    if (scrollViewRef.current) {
      if (isAtTop) {
        scrollViewRef.current.scrollToEnd({ animated: true });
      } else {
        scrollViewRef.current.scrollTo({ y: 0, animated: true });
      }
    }
  };

  if (isLoading) {
    return <ItemVariantWithInputSkeleton />;
  }

  if (error || !product) {
    return (
      <View className="flex-1 justify-center items-center p-6">
        <Text className="text-light-matte-black text-lg font-bold mb-2">
          Could not load product
        </Text>
        <Text className="text-light-error text-center mb-6">
          {error instanceof Error ? error.message : "Unknown error"}
        </Text>
      </View>
    );
  }

  return (
    <>
      <ScrollView
        ref={scrollViewRef}
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        <View className="flex-1 p-6">
          <View className="flex-row items-center mb-6">
            <Pressable onPress={() => router.back()} className="mr-4">
              <ArrowLeft color="#c71c4b" size={24} />
            </Pressable>
            <Text className="text-light-matte-black text-xl font-bold">
              {product.name}
            </Text>
          </View>

          <View className="bg-light rounded-xl py-5 mb-6 shadow-sm">
            <View className="px-5">
              {inputFields?.forms.map((field) => (
                <React.Fragment key={field.key}>
                  {renderInputField(field as TInputField)}
                </React.Fragment>
              ))}
            </View>

            {inputFields?.forms.some(
              (field) => field.type.toLowerCase() !== "option",
            ) && (
              <>
                <View className="bg-light-primary-red/10 p-4 mx-5 rounded-xl mb-6">
                  <View className="flex-row items-center gap-2">
                    <Info size={18} color="#c71c4b" className="mr-2" />
                    <Text className="text-light-matte-black/80 text-sm flex-1">
                      Have a postpaid number? Click here
                    </Text>
                    <ChevronRight size={16} color="#c71c4b" />
                  </View>
                </View>

                <View>
                  <Text className="text-light-matte-black/70 mx-5 mb-3">
                    Recently used numbers
                  </Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    className="mb-2"
                  >
                    <View className="mx-5 flex-row gap-2">
                      {["085930970697", "088975163714", "081234567890"].map(
                        (number) => (
                          <TouchableOpacity
                            key={number}
                            className="bg-light-main-container border border-light-matte-black/10 rounded-xl p-3 mr-3"
                            onPress={() => {
                              const textField = inputFields?.forms.find(
                                (f) => f.type.toLowerCase() !== "option",
                              );
                              if (textField) {
                                handleInputChange(textField.key, number);
                              }
                            }}
                            activeOpacity={0.5}
                          >
                            <Text className="text-light-matte-black">
                              {number}
                            </Text>
                          </TouchableOpacity>
                        ),
                      )}
                    </View>
                  </ScrollView>
                </View>
              </>
            )}
          </View>

          {areAllInputsFilled() ? (
            <View className="bg-light rounded-xl p-5 mb-6 shadow-sm">
              <Text className="text-light-matte-black font-bold text-lg mb-4">
                Options
              </Text>

              <View>
                <FlashList
                  data={product.variants}
                  renderItem={renderVariantItem}
                  keyExtractor={(item) => item.id}
                  estimatedItemSize={70}
                  showsVerticalScrollIndicator={false}
                />
              </View>
            </View>
          ) : (
            <View className="bg-light rounded-xl p-5 mb-6 shadow-sm">
              <View className="bg-light-primary-red/10 p-4 rounded-xl">
                <View className="flex-row items-center gap-2">
                  <Info size={18} color="#c71c4b" className="mr-2" />
                  <Text className="text-light-matte-black/80 text-sm flex-1">
                    Please fill in all required fields to view available options
                  </Text>
                </View>
              </View>
            </View>
          )}
        </View>
      </ScrollView>

      <Animated.View
        style={{
          opacity: scrollButtonOpacity,
          position: "absolute",
          right: 20,
          bottom: 100,
          backgroundColor: "#f5f6f9",
          width: 50,
          height: 50,
          borderRadius: 25,
          justifyContent: "center",
          alignItems: "center",
          elevation: 5,
          borderWidth: 1,
          borderColor: "#c71c4b",
        }}
      >
        <TouchableOpacity
          onPress={scrollToPosition}
          className="w-full h-full justify-center bg-main items-center"
        >
          {isAtTop ? (
            <ArrowDown color="#c71c4b" size={24} />
          ) : (
            <ArrowUp color="#c71c4b" size={24} />
          )}
        </TouchableOpacity>
      </Animated.View>

      <OptionSelectorModal
        visible={modalVisible}
        onClose={handleCloseModal}
        onSelect={handleOptionSelect}
        title={activeField?.alias || "Select Option"}
        options={activeField?.options || []}
        selectedOption={
          activeField && inputValues ? inputValues[activeField.key] : undefined
        }
      />
    </>
  );
}
