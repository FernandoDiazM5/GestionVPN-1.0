import importlib.util
import pathlib
import tempfile
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
                AGENT.execute('web_ban', {'target': '198.51.100.7', 'jail': 'gestionvpn-web-rate',
                                          'protectedIps': ['198.51.100.7']})

    def test_rejects_trusted_cidr(self):
        with patch.object(AGENT, 'trusted_values', return_value=['198.51.100.0/24']):
            with self.assertRaisesRegex(ValueError, 'Dirección confiable protegida'):
                AGENT.execute('web_ban', {'target': '198.51.100.7', 'jail': 'gestionvpn-web-rate'})

    def test_uses_only_fixed_one_hour_jail(self):
        with patch.object(AGENT, 'trusted_values', return_value=[]), patch.object(AGENT, 'run') as run:
            result = AGENT.execute('web_ban', {'target': '198.51.100.7',
                                               'jail': 'gestionvpn-web-rate'})
        run.assert_called_once_with(['fail2ban-client', 'set', 'gestionvpn-web-rate',
                                     'banip', '198.51.100.7'])
        self.assertEqual(result['durationSeconds'], 3600)

    def test_allows_only_fixed_scan_jails_and_durations(self):
        with patch.object(AGENT, 'trusted_values', return_value=[]), patch.object(AGENT, 'run') as run:
            six_hours = AGENT.execute('web_ban', {'target': '198.51.100.8',
                                                  'jail': 'gestionvpn-web-scan'})
            one_day = AGENT.execute('web_ban', {'target': '198.51.100.9',
                                                'jail': 'gestionvpn-web-scan-24h'})
        self.assertEqual(six_hours['durationSeconds'], 21600)
        self.assertEqual(one_day['durationSeconds'], 86400)
        self.assertEqual(run.call_count, 2)

    def test_indefinite_web_escalation_is_fixed_and_removes_temporary_copy(self):
        with patch.object(AGENT, 'trusted_values', return_value=[]), patch.object(AGENT, 'run') as run:
            result = AGENT.execute('web_ban_indefinite', {
                'target': '198.51.100.11', 'jail': 'gestionvpn-web-recidive',
                'sourceJail': 'gestionvpn-web-rate', 'protectedIps': [],
            })
        self.assertEqual(run.call_args_list[0].args[0],
                         ['fail2ban-client', 'set', 'gestionvpn-web-recidive', 'banip', '198.51.100.11'])
        self.assertEqual(run.call_args_list[1].args[0],
                         ['fail2ban-client', 'set', 'gestionvpn-web-rate', 'unbanip', '198.51.100.11'])
        self.assertIsNone(result['durationSeconds'])

    def test_indefinite_web_escalation_rechecks_trust_and_admin_session(self):
        params = {'target': '198.51.100.12', 'jail': 'gestionvpn-web-auth',
                  'sourceJail': 'gestionvpn-web-rate'}
        with patch.object(AGENT, 'trusted_values', return_value=['198.51.100.0/24']):
            with self.assertRaisesRegex(ValueError, 'Dirección confiable protegida'):
                AGENT.execute('web_ban_indefinite', params)
        with patch.object(AGENT, 'trusted_values', return_value=[]):
            with self.assertRaisesRegex(ValueError, 'Sesión administrativa protegida'):
                AGENT.execute('web_ban_indefinite', {**params, 'protectedIps': ['198.51.100.12']})


class AttemptHistoryTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.log_path = pathlib.Path(self.temp_dir.name) / 'fail2ban.log'

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_counts_only_real_sshd_detections(self):
        self.log_path.write_text(
            '2026-08-02 03:41:38,534 fail2ban.filter [727]: INFO [sshd] Found 198.51.100.7\n'
            '2026-08-02 03:41:38,535 fail2ban.filter [727]: INFO [gestionvpn-15m] Found 198.51.100.7\n'
            '2026-08-02 03:41:38,536 fail2ban.filter [727]: INFO [gestionvpn-web-auth] Found 198.51.100.7\n'
            '2026-08-02 03:43:51,815 fail2ban.filter [727]: INFO [sshd] Found 198.51.100.7\n',
            encoding='utf-8',
        )
        with patch.object(AGENT.glob, 'glob', return_value=[str(self.log_path)]):
            history = AGENT.retained_attempt_history('198.51.100.7')
            summary = AGENT.retained_attempt_summary()
        self.assertEqual(history['total'], 2)
        self.assertEqual(len(history['attempts']), 2)
        self.assertEqual(summary['counts'], {'198.51.100.7': 2})

    def test_summary_keeps_history_bounds_without_building_status_rows(self):
        self.log_path.write_text(
            '2026-08-01 10:00:00 fail2ban.filter [1]: INFO [sshd] Found 198.51.100.8\n'
            '2026-08-02 11:00:00 fail2ban.filter [1]: INFO [sshd] Found 198.51.100.9\n',
            encoding='utf-8',
        )
        with patch.object(AGENT.glob, 'glob', return_value=[str(self.log_path)]):
            summary = AGENT.retained_attempt_summary()
        self.assertEqual(summary['counts'], {'198.51.100.8': 1, '198.51.100.9': 1})
        self.assertLess(summary['historySince'], summary['historyUntil'])


if __name__ == '__main__':
    unittest.main()
