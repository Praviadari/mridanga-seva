import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/auth-context';
import { useLanguage } from '../context/language-context';
import { BrandColors } from '../constants/theme';

export const AuthScreen: React.FC<{ onDismiss?: () => void }> = ({ onDismiss }) => {
  const { signIn, isConfigured } = useAuth();
  const { t } = useLanguage();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSignIn = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Required Fields', 'Please enter email and password.');
      return;
    }

    setIsSubmitting(true);
    const res = await signIn(email.trim(), password.trim());
    setIsSubmitting(false);

    if (res.error) {
      Alert.alert('Login Failed', res.error);
    } else {
      if (onDismiss) onDismiss();
    }
  };

  const handleDemoLogin = async (roleEmail: string) => {
    setIsSubmitting(true);
    await signIn(roleEmail, 'password123');
    setIsSubmitting(false);
    if (onDismiss) onDismiss();
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <View style={styles.iconCircle}>
          <Ionicons name="musical-notes" size={32} color={BrandColors.primary} />
        </View>

        <Text style={styles.title}>{t('appName')}</Text>
        <Text style={styles.subtitle}>
          {isConfigured ? 'Sign in with your temple email' : 'Demo & Testing Mode Active'}
        </Text>

        <View style={styles.form}>
          <Text style={styles.label}>{t('email')}</Text>
          <TextInput
            style={styles.input}
            placeholder="coordinator@mridanga.org"
            placeholderTextColor="#94A3B8"
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            onChangeText={setEmail}
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            placeholder="••••••••"
            placeholderTextColor="#94A3B8"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />

          <TouchableOpacity
            style={[styles.btn, isSubmitting && { opacity: 0.6 }]}
            onPress={handleSignIn}
            disabled={isSubmitting}
          >
            <Text style={styles.btnText}>
              {isSubmitting ? 'Signing in...' : 'Sign In'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Demo 1-tap fast access */}
        <View style={styles.demoSection}>
          <Text style={styles.demoTitle}>QUICK DEMO LOGIN:</Text>
          <View style={styles.demoBtns}>
            <TouchableOpacity
              style={styles.demoBtn}
              onPress={() => handleDemoLogin('coordinator@example.com')}
            >
              <Text style={styles.demoBtnText}>Coordinator</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.demoBtn}
              onPress={() => handleDemoLogin('guru@example.com')}
            >
              <Text style={styles.demoBtnText}>Guru</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.demoBtn}
              onPress={() => handleDemoLogin('student@example.com')}
            >
              <Text style={styles.demoBtnText}>Student</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 3,
  },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: BrandColors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
  },
  subtitle: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 4,
    marginBottom: 20,
    textAlign: 'center',
  },
  form: {
    width: '100%',
    gap: 12,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0F172A',
  },
  btn: {
    backgroundColor: BrandColors.primary,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  btnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  demoSection: {
    marginTop: 24,
    width: '100%',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 16,
    alignItems: 'center',
  },
  demoTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  demoBtns: {
    flexDirection: 'row',
    gap: 8,
  },
  demoBtn: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  demoBtnText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '600',
  },
});
