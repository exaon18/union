"""
URL configuration for union project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.1/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import include, path, re_path

from health.frontend import serve_frontend, serve_lab

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('health.urls')),
    # Static ASTRA HEALTH frontend (frontend/) served by Django: http://<host>:8000/app/
    path('app', serve_frontend),
    re_path(r'^app/(?P<path>.*)$', serve_frontend, name='frontend'),
    # Simulation Lab (testing tool, not part of the crew system): http://<host>:8000/lab/
    path('lab', serve_lab),
    re_path(r'^lab/(?P<path>.*)$', serve_lab, name='lab'),
    path('', include('core.urls')),
]
