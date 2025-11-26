import { CheckCircle, Wrench, XCircle, Zap } from "lucide-react-native";
import React from "react";
import { ActivityIndicator, Text, View } from "react-native";

interface ToolCallDisplayProps {
  toolName: string;
  toolCallId: string;
  input?: any;
  output?: any;
  isError?: boolean;
}

const ToolCallDisplay: React.FC<ToolCallDisplayProps> = ({
  toolName,
  toolCallId,
  input,
  output,
  isError,
}) => {
  const isExecuting = !output && !isError;
  const hasCompleted = output !== undefined || isError;

  const formattedToolName = toolName
    .replace(/_/g, " ")
    .replace(/([A-Z])/g, " $1")
    .trim()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");

  return (
    <View
      className={`my-1.5 rounded-2xl px-3.5 py-2.5 ${
        isExecuting
          ? "bg-light-primary-red/10 border border-light-primary-red/30"
          : isError
            ? "bg-red-50 border border-red-200"
            : "bg-green-50/50 border border-green-200"
      }`}
    >
      <View className="flex-row items-start gap-2.5">
        <View className="mt-0.5">
          {isExecuting ? (
            <View className="relative">
              <Zap size={16} color="#c71c4b" fill="#c71c4b" />
              <View className="absolute -right-1 -bottom-1">
                <ActivityIndicator size={10} color="#c71c4b" />
              </View>
            </View>
          ) : isError ? (
            <XCircle size={16} color="#dc2626" />
          ) : (
            <CheckCircle size={16} color="#10b981" fill="#10b981" />
          )}
        </View>

        <View className="flex-1">
          <View className="flex-row items-center gap-1.5 mb-0.5">
            <Wrench
              size={12}
              color={isExecuting ? "#c71c4b" : isError ? "#dc2626" : "#10b981"}
            />
            <Text
              className={`text-xs font-bold ${
                isExecuting
                  ? "text-light-primary-red"
                  : isError
                    ? "text-red-600"
                    : "text-green-700"
              }`}
            >
              {isExecuting
                ? "🔄 Executing..."
                : isError
                  ? "❌ Failed"
                  : "✅ Completed"}
            </Text>
          </View>

          <Text className="text-sm font-semibold text-light-matte-black mb-0.5">
            {formattedToolName}
          </Text>

          {input && Object.keys(input).length > 0 && (
            <View className="mt-1.5 bg-white/60 rounded-lg px-2 py-1.5">
              <Text className="text-[10px] font-medium text-light-matte-black/60 mb-0.5">
                Parameters:
              </Text>
              <Text className="text-[10px] text-light-matte-black/70 font-mono">
                {JSON.stringify(input, null, 2)}
              </Text>
            </View>
          )}

          {hasCompleted && !isError && (
            <Text className="text-[10px] text-green-700 font-medium mt-1">
              Tool executed successfully
            </Text>
          )}

          {isError && output && (
            <View className="mt-1.5 bg-red-100/50 rounded-lg px-2 py-1.5">
              <Text className="text-[10px] text-red-700 font-medium">
                {typeof output === "string" ? output : JSON.stringify(output)}
              </Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
};

export default ToolCallDisplay;
