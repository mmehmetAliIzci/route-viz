from django.urls import path

from planner import views

urlpatterns = [
    path("api/plan", views.plan_view),
    path("api/geocode", views.geocode_view),
    path("api/samples", views.samples_view),
    path("api/samples/<slug:sample_id>", views.sample_view),
]
