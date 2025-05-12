import { Text, View } from "react-native";
import { english, generateMnemonic, generatePrivateKey } from 'viem/accounts';

export default function Home() {
  const privateKey = generatePrivateKey()
  console.log({privateKey})
  
  const mnemonic = generateMnemonic(english)
  console.log({mnemonic})
  return <View>
    <Text>Hello</Text>
    <Text>{privateKey}</Text>
    <Text>{mnemonic}</Text>
  </View>;
}
