{{/*
Return the API image
*/}}
{{- define "familyroots.apiImage" -}}
{{ .Values.global.imageRegistry }}/{{ .Values.image.org }}/familyroots/api:{{ .Values.image.tag }}
{{- end }}

{{/*
Return the worker image
*/}}
{{- define "familyroots.workerImage" -}}
{{ .Values.global.imageRegistry }}/{{ .Values.image.org }}/familyroots/worker:{{ .Values.image.tag }}
{{- end }}

{{/*
Return the frontend image
*/}}
{{- define "familyroots.frontendImage" -}}
{{ .Values.global.imageRegistry }}/{{ .Values.image.org }}/familyroots/frontend:{{ .Values.image.tag }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "familyroots.labels" -}}
app.kubernetes.io/name: familyroots
app.kubernetes.io/managed-by: Helm
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}
{{- end }}

{{/*
Inactive slot — the one that is NOT currently active
*/}}
{{- define "familyroots.inactiveSlot" -}}
{{- if eq .Values.blueGreen.activeSlot "blue" }}green{{ else }}blue{{ end }}
{{- end }}
