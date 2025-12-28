---
name: react-hook-form-patterns
description: React Hook Form patterns for form handling, validation, and submission. Use when building forms, implementing validation, or managing form state.
---

# React Hook Form Patterns

Form handling patterns with React Hook Form v7 and Zod validation.

## Basic Form Setup

```typescript
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const sendSchema = z.object({
  recipient: z.string().min(1, 'Recipient is required'),
  amount: z.string().regex(/^\d+\.?\d*$/, 'Invalid amount'),
  memo: z.string().optional(),
});

type SendFormData = z.infer<typeof sendSchema>;

function SendForm() {
  const { control, handleSubmit, formState: { errors, isSubmitting } } = useForm<SendFormData>({
    resolver: zodResolver(sendSchema),
    defaultValues: {
      recipient: '',
      amount: '',
      memo: '',
    },
  });

  const onSubmit = async (data: SendFormData) => {
    await sendTransaction(data);
  };

  return (
    <View className="gap-4">
      <Controller
        control={control}
        name="recipient"
        render={({ field: { onChange, onBlur, value } }) => (
          <View>
            <TextInput
              className="bg-gray-100 rounded-xl px-4 py-3"
              placeholder="Recipient address"
              onBlur={onBlur}
              onChangeText={onChange}
              value={value}
            />
            {errors.recipient && (
              <Text className="text-red-500 text-sm mt-1">{errors.recipient.message}</Text>
            )}
          </View>
        )}
      />

      <Controller
        control={control}
        name="amount"
        render={({ field: { onChange, onBlur, value } }) => (
          <View>
            <TextInput
              className="bg-gray-100 rounded-xl px-4 py-3"
              placeholder="Amount"
              keyboardType="numeric"
              onBlur={onBlur}
              onChangeText={onChange}
              value={value}
            />
            {errors.amount && (
              <Text className="text-red-500 text-sm mt-1">{errors.amount.message}</Text>
            )}
          </View>
        )}
      />

      <Pressable
        className="bg-primary py-4 rounded-xl items-center"
        onPress={handleSubmit(onSubmit)}
        disabled={isSubmitting}
      >
        <Text className="text-white font-semibold">
          {isSubmitting ? 'Sending...' : 'Send'}
        </Text>
      </Pressable>
    </View>
  );
}
```

## Reusable Input Component

```typescript
import { Controller, Control, FieldPath, FieldValues } from 'react-hook-form';

type FormInputProps<T extends FieldValues> = {
  control: Control<T>;
  name: FieldPath<T>;
  placeholder?: string;
  keyboardType?: 'default' | 'numeric' | 'email-address';
  secureTextEntry?: boolean;
};

function FormInput<T extends FieldValues>({
  control,
  name,
  placeholder,
  keyboardType = 'default',
  secureTextEntry,
}: FormInputProps<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field: { onChange, onBlur, value }, fieldState: { error } }) => (
        <View>
          <TextInput
            className={`bg-gray-100 rounded-xl px-4 py-3 ${error ? 'border border-red-500' : ''}`}
            placeholder={placeholder}
            keyboardType={keyboardType}
            secureTextEntry={secureTextEntry}
            onBlur={onBlur}
            onChangeText={onChange}
            value={value}
          />
          {error && (
            <Text className="text-red-500 text-sm mt-1">{error.message}</Text>
          )}
        </View>
      )}
    />
  );
}

// Usage
<FormInput control={control} name="email" placeholder="Email" keyboardType="email-address" />
```

## Form with Select/Picker

```typescript
function TokenSelector({ control }: { control: Control<FormData> }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Controller
      control={control}
      name="token"
      render={({ field: { onChange, value } }) => (
        <>
          <Pressable
            className="bg-gray-100 rounded-xl px-4 py-3 flex-row justify-between items-center"
            onPress={() => setIsOpen(true)}
          >
            <Text>{value?.symbol || 'Select token'}</Text>
            <ChevronDown className="text-gray-500" />
          </Pressable>

          <TokenSelectorModal
            visible={isOpen}
            onClose={() => setIsOpen(false)}
            onSelect={(token) => {
              onChange(token);
              setIsOpen(false);
            }}
            selectedToken={value}
          />
        </>
      )}
    />
  );
}
```

## Form with Dynamic Fields

```typescript
import { useFieldArray } from 'react-hook-form';

function MultiRecipientForm() {
  const { control, handleSubmit } = useForm<{ recipients: Recipient[] }>({
    defaultValues: {
      recipients: [{ address: '', amount: '' }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'recipients',
  });

  return (
    <View className="gap-4">
      {fields.map((field, index) => (
        <View key={field.id} className="flex-row gap-2">
          <FormInput
            control={control}
            name={`recipients.${index}.address`}
            placeholder="Address"
          />
          <FormInput
            control={control}
            name={`recipients.${index}.amount`}
            placeholder="Amount"
            keyboardType="numeric"
          />
          {fields.length > 1 && (
            <Pressable onPress={() => remove(index)}>
              <Trash className="text-red-500" />
            </Pressable>
          )}
        </View>
      ))}

      <Pressable onPress={() => append({ address: '', amount: '' })}>
        <Text className="text-primary">+ Add recipient</Text>
      </Pressable>
    </View>
  );
}
```

## Watch and Computed Values

```typescript
function AmountInput() {
  const { control, watch, setValue } = useForm<FormData>();
  const amount = watch('amount');
  const { data: rate } = useExchangeRate();

  const usdValue = useMemo(() => {
    if (!amount || !rate) return '0.00';
    return (parseFloat(amount) * rate).toFixed(2);
  }, [amount, rate]);

  return (
    <View>
      <FormInput control={control} name="amount" placeholder="Amount" keyboardType="numeric" />
      <Text className="text-gray-500 mt-1">≈ ${usdValue} USD</Text>

      {/* Quick amount buttons */}
      <View className="flex-row gap-2 mt-2">
        {[25, 50, 100].map((preset) => (
          <Pressable
            key={preset}
            className="bg-gray-100 px-4 py-2 rounded-lg"
            onPress={() => setValue('amount', preset.toString())}
          >
            <Text>${preset}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
```

## Zod Validation Patterns

```typescript
// Complex validation schema
const bookingSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid(),
  quantity: z.number().min(1).max(10),
  inputFields: z.record(z.string(), z.string()).optional(),
  phoneNumber: z.string()
    .regex(/^08\d{8,11}$/, 'Invalid phone number')
    .optional()
    .or(z.literal('')),
  email: z.string().email().optional().or(z.literal('')),
});

// Conditional validation
const transferSchema = z.object({
  type: z.enum(['internal', 'external']),
  recipient: z.string(),
  amount: z.string(),
}).refine(
  (data) => {
    if (data.type === 'external') {
      return /^0x[a-fA-F0-9]{40}$/.test(data.recipient);
    }
    return true;
  },
  { message: 'Invalid address', path: ['recipient'] }
);
```

## Form Reset and Prefill

```typescript
function EditProfileForm({ profile }: { profile: Profile }) {
  const { control, handleSubmit, reset } = useForm<ProfileData>({
    defaultValues: profile,
  });

  // Reset when profile changes
  useEffect(() => {
    reset(profile);
  }, [profile, reset]);

  const onCancel = () => {
    reset(); // Reset to defaultValues
  };

  return (
    <View>
      <FormInput control={control} name="name" placeholder="Name" />
      <View className="flex-row gap-4 mt-4">
        <Pressable onPress={onCancel}>
          <Text>Cancel</Text>
        </Pressable>
        <Pressable onPress={handleSubmit(onSubmit)}>
          <Text>Save</Text>
        </Pressable>
      </View>
    </View>
  );
}
```

## Best Practices

1. **Use Zod for validation** - Type-safe schema validation
2. **Create reusable input components** - Wrap Controller in custom components
3. **Use watch sparingly** - Only subscribe to fields you need
4. **Handle form errors gracefully** - Show inline errors, not alerts
5. **Use defaultValues** - Always initialize form with default values
6. **Leverage formState** - Use isSubmitting, isDirty, isValid for UI state
