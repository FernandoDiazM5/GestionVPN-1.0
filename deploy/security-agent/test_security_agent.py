import importlib.util
import pathlib
import unittest
from unittest.mock import patch

MODULE_PATH = pathlib.Path(__file__).with_name('security-agent.py')
SPEC = importlib.util.spec_from_file_location('gestionvpn_security_agent', MODULE_PATH)
AGENT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(AGENT)


class WebBanPolicyTests(unittest.TestCase):
    def test_rejects_wrong_jail_and_active_admin_ip(self):
        with patch.object(AGENT, 'trusted_values', return_value=[]):
            with self.assertRaisesRegex(ValueError, 'Jail web no autorizado'):
                AGENT.execute('web_ban', {'target': '198.51.100.7', 'jail': 'sshd'})
            with self.assertRaisesRegex(ValueError, 'Sesión administrativa protegida'):
                AGENT.execute('web_ban', {'target': '198.51.100.7', 'jail': 'gestionvpn-web-1h',
                                          'protectedIps': ['198.51.100.7']})

    def test_rejects_trusted_cidr(self):
        with patch.object(AGENT, 'trusted_values', return_value=['198.51.100.0/24']):
            with self.assertRaisesRegex(ValueError, 'Dirección confiable protegida'):
                AGENT.execute('web_ban', {'target': '198.51.100.7', 'jail': 'gestionvpn-web-1h'})

    def test_uses_only_fixed_one_hour_jail(self):
        with patch.object(AGENT, 'trusted_values', return_value=[]), patch.object(AGENT, 'run') as run:
            result = AGENT.execute('web_ban', {'target': '198.51.100.7',
                                               'jail': 'gestionvpn-web-1h'})
        run.assert_called_once_with(['fail2ban-client', 'set', 'gestionvpn-web-1h',
                                     'banip', '198.51.100.7'])
        self.assertEqual(result['durationSeconds'], 3600)

    def test_allows_only_fixed_scan_jails_and_durations(self):
        with patch.object(AGENT, 'trusted_values', return_value=[]), patch.object(AGENT, 'run') as run:
            six_hours = AGENT.execute('web_ban', {'target': '198.51.100.8',
                                                  'jail': 'gestionvpn-web-scan-6h'})
            one_day = AGENT.execute('web_ban', {'target': '198.51.100.9',
                                                'jail': 'gestionvpn-web-scan-24h'})
        self.assertEqual(six_hours['durationSeconds'], 21600)
        self.assertEqual(one_day['durationSeconds'], 86400)
        self.assertEqual(run.call_count, 2)

    def test_indefinite_web_escalation_is_fixed_and_removes_temporary_copy(self):
        with patch.object(AGENT, 'trusted_values', return_value=[]), patch.object(AGENT, 'run') as run:
            result = AGENT.execute('web_ban_indefinite', {
                'target': '198.51.100.11', 'jail': 'gestionvpn-indefinite',
                'sourceJail': 'gestionvpn-web-1h', 'protectedIps': [],
            })
        self.assertEqual(run.call_args_list[0].args[0],
                         ['fail2ban-client', 'set', 'gestionvpn-indefinite', 'banip', '198.51.100.11'])
        self.assertEqual(run.call_args_list[1].args[0],
                         ['fail2ban-client', 'set', 'gestionvpn-web-1h', 'unbanip', '198.51.100.11'])
        self.assertIsNone(result['durationSeconds'])

    def test_indefinite_web_escalation_rechecks_trust_and_admin_session(self):
        params = {'target': '198.51.100.12', 'jail': 'gestionvpn-indefinite',
                  'sourceJail': 'gestionvpn-web-1h'}
        with patch.object(AGENT, 'trusted_values', return_value=['198.51.100.0/24']):
            with self.assertRaisesRegex(ValueError, 'Dirección confiable protegida'):
                AGENT.execute('web_ban_indefinite', params)
        with patch.object(AGENT, 'trusted_values', return_value=[]):
            with self.assertRaisesRegex(ValueError, 'Sesión administrativa protegida'):
                AGENT.execute('web_ban_indefinite', {**params, 'protectedIps': ['198.51.100.12']})


if __name__ == '__main__':
    unittest.main()
