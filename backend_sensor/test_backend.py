"""
Unit tests for Plant Doctor Field Sensor Flask Backend.
"""

import unittest
import json
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import database
import app as flask_app


class FieldSensorBackendTestCase(unittest.TestCase):
    def setUp(self):
        # Create a temporary database for testing
        self.temp_db_fd, self.temp_db_path = tempfile.mkstemp(suffix=".db")
        database.DB_PATH = self.temp_db_path
        database.init_db()

        self.client = flask_app.app.test_client()
        self.client.testing = True

    def tearDown(self):
        import gc
        gc.collect()
        try:
            os.close(self.temp_db_fd)
        except OSError:
            pass
        try:
            if os.path.exists(self.temp_db_path):
                os.remove(self.temp_db_path)
        except PermissionError:
            pass

    def test_health_check(self):
        res = self.client.get("/api/health")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertEqual(data.get("status"), "ok")

    def test_ingest_valid_real_reading(self):
        payload = {
            "device_id": "FIELD_01",
            "temperature": 32.5,
            "humidity": 65.0,
            "motion": True,
            "is_simulated": False,
        }
        res = self.client.post("/api/sensor-readings", json=payload)
        self.assertEqual(res.status_code, 201)
        data = res.get_json()
        self.assertEqual(data["status"], "success")
        self.assertEqual(data["data"]["device_id"], "FIELD_01")
        self.assertEqual(data["data"]["temperature"], 32.5)
        self.assertEqual(data["data"]["humidity"], 65.0)
        self.assertTrue(data["data"]["motion"])
        self.assertFalse(data["data"]["is_simulated"])

    def test_ingest_example_user_format(self):
        # User specified: {"device_id":"FIELD_01","temperature":32,"humidity":65,"motion": ...}
        payload = {
            "device_id": "FIELD_01",
            "temperature": 32,
            "humidity": 65,
            "motion": 1
        }
        res = self.client.post("/api/sensor-readings", json=payload)
        self.assertEqual(res.status_code, 201)
        data = res.get_json()
        self.assertEqual(data["data"]["temperature"], 32.0)
        self.assertEqual(data["data"]["humidity"], 65.0)
        self.assertTrue(data["data"]["motion"])
        # Defaults to real data (is_simulated = False)
        self.assertFalse(data["data"]["is_simulated"])

    def test_ingest_simulated_reading(self):
        payload = {
            "device_id": "SIM_01",
            "temperature": 25.0,
            "humidity": 50.0,
            "motion": False,
            "is_simulated": True,
        }
        res = self.client.post("/api/sensor-readings", json=payload)
        self.assertEqual(res.status_code, 201)
        data = res.get_json()
        self.assertTrue(data["data"]["is_simulated"])

    def test_invalid_temperature_rejected(self):
        payload = {
            "device_id": "FIELD_01",
            "temperature": 999.0,  # Out of range
            "humidity": 50.0,
            "motion": False,
        }
        res = self.client.post("/api/sensor-readings", json=payload)
        self.assertEqual(res.status_code, 422)

    def test_invalid_humidity_rejected(self):
        payload = {
            "device_id": "FIELD_01",
            "temperature": 25.0,
            "humidity": 150.0,  # Out of range
            "motion": False,
        }
        res = self.client.post("/api/sensor-readings", json=payload)
        self.assertEqual(res.status_code, 422)

    def test_missing_device_id_rejected(self):
        payload = {
            "temperature": 25.0,
            "humidity": 50.0,
            "motion": False,
        }
        res = self.client.post("/api/sensor-readings", json=payload)
        self.assertEqual(res.status_code, 422)

    def test_get_latest_and_history(self):
        # Empty at start
        res = self.client.get("/api/sensor-readings/latest")
        self.assertEqual(res.status_code, 200)
        self.assertIsNone(res.get_json()["reading"])

        # Insert 2 readings
        self.client.post("/api/sensor-readings", json={
            "device_id": "FIELD_01", "temperature": 20.0, "humidity": 45.0, "motion": False
        })
        self.client.post("/api/sensor-readings", json={
            "device_id": "FIELD_01", "temperature": 35.0, "humidity": 75.0, "motion": True
        })

        # Latest should be the 35.0 reading
        res_latest = self.client.get("/api/sensor-readings/latest")
        self.assertEqual(res_latest.status_code, 200)
        latest = res_latest.get_json()["reading"]
        self.assertIsNotNone(latest)
        self.assertEqual(latest["temperature"], 35.0)
        self.assertTrue(latest["motion"])

        # History should contain 2 items, newest first
        res_hist = self.client.get("/api/sensor-readings/history")
        self.assertEqual(res_hist.status_code, 200)
        readings = res_hist.get_json()["readings"]
        self.assertEqual(len(readings), 2)
        self.assertEqual(readings[0]["temperature"], 35.0)
        self.assertEqual(readings[1]["temperature"], 20.0)

    def test_simulate_endpoint(self):
        res = self.client.post("/api/sensor-readings/simulate", json={"device_id": "TEST_SIM"})
        self.assertEqual(res.status_code, 201)
        data = res.get_json()
        self.assertEqual(data["data"]["device_id"], "TEST_SIM")
        self.assertTrue(data["data"]["is_simulated"])


if __name__ == "__main__":
    unittest.main()
